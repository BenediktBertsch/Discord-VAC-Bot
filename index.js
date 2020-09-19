const SteamUser = require('steam-user');
const steamClient = new SteamUser();
const CSGO = require('globaloffensive');
const csgoUser = new CSGO(steamClient);
const Discord = require('discord.js');
const client = new Discord.Client();
const log4js = require('log4js');
const typeorm = require('typeorm');
const axios = require('axios');
const { env } = require('process');

require('dotenv').config();

log4js.configure({
    appenders: {
        app: { type: 'dateFile', filename: './log/', pattern: 'yyyy-MM-dd.log', alwaysIncludePattern: true },
        console: { type: "console" }
    },
    categories: { default: { appenders: ["app", "console"], level: 'trace' } }
})
var logger = log4js.getLogger();

var connection, monitoringRepository, mmRepository, steamids, steamidparameter, searchedids = [];

const logOnOptions = {
    accountName: env.STEAM_ACCNAME,
    password: env.STEAM_ACCPASS,
}

start();

async function dbinit() {
    connection = await typeorm.createConnection({
        type: env.DB_TYPE,
        host: env.DB_HOST,
        port: env.DB_PORT,
        username: env.DB_USER,
        password: env.DB_PASS,
        database: env.DB_NAME,
        synchronize: true,
        entities: [
            new typeorm.EntitySchema(require("./entity/MatchmakingAccounts.json")),
            new typeorm.EntitySchema(require("./entity/MonitoringAccounts.json"))
        ]
    }).catch((err) => {
        logger.fatal(err)
    })
    logger.info("DB Connection established.");
    monitoringRepository = connection.getRepository("MonitoringAccounts");
    mmRepository = connection.getRepository("MatchmakingAccounts");
}

async function start() {
    if (checkConfig()) {
        logger.info("Discord Bot starting...");
        await client.login(env.DISCORD_TOKEN);
        await dbinit()
        check()
        await checkForBan()
        setInterval(check, 900000) //15 min = 900000
        setInterval(checkForBan, 86400000) //1 day / 24 hours = 86400000
    }
}

function checkConfig() {
    //Check Environment Variables
    if (!env.DB_TYPE || !env.DB_HOST || !env.DB_PORT || !env.DB_USER || !env.DB_PASS || !env.DB_NAME || !env.DISCORD_TOKEN || !env.STEAM_ACCNAME || !env.STEAM_APIKEY || !env.STEAM_ACCPASS) {
        if (!env.DB_TYPE || !env.DB_HOST || !env.DB_PORT || !env.DB_USER || !env.DB_PASS || !env.DB_NAME) {
            logger.fatal("DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASS and DB_NAME are needed.");
        }
        if (!env.DISCORD_TOKEN) {
            logger.fatal("DISCORD_TOKEN is needed.")
        }
        if (!env.STEAM_ACCNAME || !env.STEAM_APIKEY || !env.STEAM_ACCPASS) {
            logger.fatal("STEAM_ACCNAME, STEAM_ACCPASS and STEAM_APIKEY are needed.");
        }
        process.exit();
    }
    return true;
}

client.on('ready', () => {
    logger.info("Logged in as user " + client.user.tag + "!");
});

client.on('message', async (msg) => {
    if (msg.author.bot) return;
    await command(msg)
});

async function command(msg) {
    if (msg.content.toLowerCase().includes("!register") && !msg.content.toLowerCase().split(' ')[1]) {
        msg.reply('Wrong command! Use "!register steamid64/STEAM_ID/Custom community URL"');
    } else if (msg.content.toLowerCase().includes("!register") && msg.content.toLowerCase().split(' ')[1]) {
        await registerCommand(msg);
    }
    if (msg.content.toLowerCase().includes("!unregister") && !msg.content.toLowerCase().split(' ')[1]) {
        msg.reply('Wrong command! Use "!unregister steamid64"');
    } else if (msg.content.toLowerCase().includes("!unregister") && msg.content.toLowerCase().split(' ')[1]) {
        await unregisterCommand(msg);
    }
    if (msg.content.toLowerCase().includes("!list")) {
        await listCommand(msg);
    }
}

async function registerCommand(msg) {
    var steamid = msg.content.split(' ')[1];
    var steamAccID = /^STEAM_[0-5]:[0-1]:\d+$/;
    var containsAnyChar = /^.*[a-zA-Z].*$/;
    var steamId64min = 0x0110000100000001n;
    var steamId64max = 0x01100001FFFFFFFFn;
    if (!containsAnyChar.test(steamid)) {
        if (BigInt(steamid) >= steamId64min && BigInt(steamid) <= steamId64max) {
            register(steamid, msg);
        }
    } else if (steamAccID.test(steamid)) {
        register(steamIdTo64(steamid), msg);
    } else {
        var fetchsteamid = await getSteamIdBySteamcommunity(steamid);
        if (fetchsteamid !== '') {
            register(fetchsteamid, msg);
        } else {
            msg.reply("the input steam id could not be verified as a player.");
        }
    }
}

function steamIdTo64(steamid) {
    var y = BigInt(steamid.split(':')[1]);
    var z = BigInt(steamid.split(':')[2]);
    var v = 0x0110000100000000n;
    return (z * 2n) + v + y;
}

async function register(steamid, msg) {
    var steamid_db = {
        id: steamid
    }
    if (await monitoringRepository.findOne(steamid) === undefined) {
        if (await mmRepository.findOne({
            id: steamid,
            date: new Date().toJSON().slice(0, 10)
        })) {
            mmRepository.remove({
                id: steamid,
                date: new Date().toJSON().slice(0, 10)
            });
        }
        monitoringRepository.save(steamid_db).then((savedsteamid) => {
            logger.info("SteamID: " + savedsteamid.id + " added. Will be monitored now.");
            msg.reply("SteamID: " + savedsteamid.id + " added. Will be monitored now.");
        }).catch((err) => {
            logger.error(err);
        })
    } else {
        logger.warn("SteamID already in the database.");
        msg.reply("SteamID already in the database.");
    }
}

async function getSteamIdBySteamcommunity(username) {
    body = await axios.get(`http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${env.STEAM_APIKEY}&vanityurl=${username}`);
    return body.data.response.steamid ? body.data.response.steamid : '';
}

async function unregisterCommand(msg) {
    var steamid = msg.content.toLowerCase().split(' ')[1]
    if (await monitoringRepository.findOne(steamid)) {
        var steamid_db = {
            id: steamid
        }
        monitoringRepository.remove(steamid_db).then(() => {
            logger.info("SteamID: " + steamid + " removed. Will not be monitored anymore.")
            msg.reply("SteamID: " + steamid + " removed. Will not be monitored anymore.")
        }).catch((err) => {
            logger.error(err)
        })
    } else {
        logger.warn("SteamID not found.")
    }
}

async function listCommand(msg) {
    value = await monitoringRepository.find();
    var array = [], body;
    for (let i = 0; i < Math.ceil(value.length / 100); i++) {
        steamidparameter = '';
        steamidparameter = value.slice(i * 100, (i + 1) * 100).reduce((acc, cur) => acc += cur.id + ',', 'steamids=');
        body = await axios.get('http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=' + env.STEAM_APIKEY + '&steamids=' + steamidparameter)
        if (body.data.response.players[0]) {
            body.data.response.players.forEach((player) => {
                array.push('[' + player.personaname + '](' + player.profileurl + ') steamid: ' + player.steamid)
            })
        }
    }
    msg.reply(createMessageEmbed(array, 'Following player are monitored'));
}

function createMessageEmbed(stringArray, name) {
    var count = 0;
    var fieldCount = 0;
    var fieldsList = [];
    var fieldEmdedCount = 0;
    stringArray.reduce((acc, cur) => {
        count += (cur.length + 2)
        if (count >= 1024) {
            acc.push({ text: '', count: 0 });
            fieldCount++;
            count = 0;
        }
        acc[fieldCount].text += `${cur}\n`;
        acc[fieldCount].count++;
        return acc;
    }, [{ text: '', count: 0 }]).forEach((e, i) => {
        fieldsList.push({ name: `${name} (${(fieldEmdedCount + 1)} - ${fieldEmdedCount + e.count}):`, value: e.text });
        fieldEmdedCount += e.count;
    });

    return messageEmbed = new Discord.MessageEmbed()
        .setColor('#f04747')
        .setTitle('Ban Checker')
        .setFooter('Made by Xaviius', 'https://cdn.discordapp.com/avatars/259673189980962816/5de3690afcc8cd7dcb71846230e50647.webp?size=128')
        .addFields(
            fieldsList
        )
        .setTimestamp();
}

function check() {
    steamClient.logOn(logOnOptions);
}

steamClient.on('loggedOn', async (response) => {
    if (response.eresult === 1) {
        logger.info("Checking for running matchmaking games.");
        steamids = await monitoringRepository.find();
        steamClient.gamesPlayed([730]);
    } else {
        logger.warn("Could not connect to steam. Login failed.");
        logger.error(response);
    }
})

csgoUser.on('connectedToGC', async () => {
    searchedids = []
    for (let steamid of steamids) {
        if (!searchedids.some((searched) => searched === steamid.id)) {
            csgoUser.requestLiveGameForUser(steamid.id);
            await sleep(1000)
        }
    }
})

csgoUser.on('matchList', async (response) => {
    if (response[0]) {
        response[0].roundstats_legacy.reservation.account_ids.forEach(async (accid) => {
            if (await monitoringRepository.findOne(csgoClient.ToSteamID(accid)) === undefined && await mmRepository.findOne(csgoClient.ToSteamID(accid)) === undefined) {
                var steamid_db = {
                    id: csgoClient.ToSteamID(accid),
                    date: new Date().toJSON().slice(0, 10)
                };
                searchedids.push(csgoClient.ToSteamID(accid));
                mmRepository.save(steamid_db).then(() => logger.info("SteamID: " + csgoClient.ToSteamID(accid) + " added to matchmaking accounts."))
                    .catch((err) => logger.error(err));
            }
        })
    }
})

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function checkForBan() {
    var allsteamids = await mmRepository.find(), body;
    var bannedplayerids = '', bannedplayers = [];
    for (let i = 0; i < Math.ceil(allsteamids.length / 100); i++) {
        steamidparameter = allsteamids.slice(i * 100, (i + 1) * 100).reduce((acc, cur) => acc += cur.id + ',', 'steamids=');
        body = await axios.get('http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=' + env.STEAM_APIKEY + '&' + steamidparameter);
        bannedplayerids += body.data.players.reduce((acc, cur) => acc += cur.VACBanned === 1 || cur.NumberOfGameBans >= 1 ? cur.SteamId + ',' : '', '');
    }
    if (bannedplayerids !== '') {
        for (let i = 0; i < Math.ceil(bannedplayerids.split(',').length / 100); i++) {
            steamidparameter = bannedplayerids.split(',').slice(i * 100, (i + 1) * 100).reduce((acc, cur) => acc += cur + ',', 'steamids=');
            body = await axios.get('http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=' + env.STEAM_APIKEY + '&' + steamidparameter);
            body.data.response.players.forEach((player) => bannedplayers.push(player));
        }
        sendBannedEmbed(bannedplayers);
    }
}

async function sendBannedEmbed(players) {
    var array = [];
    await Promise.all(players.map(async (player) => {
        var date = (await mmRepository.findOne(player.steamid)).date;
        array.push('[' + player.personaname + '](' + player.profileurl + '), last seen: ' + date.split('-')[2] + '.' + date.split('-')[1] + '.' + date.split('-')[0]);
    }));
    client.channels.cache.get('751753296737468486').send(createMessageEmbed(array, 'Following players got banned'))
}
