const { Server } = require('ws');
const fetch = require('node-fetch');
const ms = require('ms');
const prettyms = require('pretty-ms');
const dayjs = require('dayjs');
const { obfuscate } = require('javascript-obfuscator');

const wss = new Server({ 
    port: process.env.PORT || 8080,
    maxPayload: 1e5,
});
wss.users = {}; 
wss.blacklist = new Set();

Object.filter = (obj, predicate) =>
    Object.keys(obj)
        .filter( key => predicate(obj[key]) )
        .reduce( (res, key) => (res[key] = obj[key], res), {} );

wss.on('connection', function(socket, request) {
    console.log('A new client has connected to the server.');

    socket.blacklist = function() {
        wss.blacklist.add(socket.ip);
        socket.terminate();
    };

    socket.ip = request.connection.remoteAddress || 
        request.socket.remoteAddress ||
        request.connection.socket.remoteAddress ||
        request.headers['x-forwarded-for'];
    socket.authorizedLevel = 0;

    if (wss.blacklist.has(socket.ip)) return socket.close();

    setInterval(() => {
        if (!socket.data) return;
        if (socket.data.messageCooldown !== 0) socket.data.messageCooldown -= 1;
        if (socket.data.mute.time !== 0) socket.data.mute.time -= 1000;
        if (socket.data.mute.time <= 0 && socket.data.mute.muted) {
            socket.send(JSON.stringify({ header: 'SYSTEM_MESSAGE', data: { message: 'Your mute has been lifted.', } }));
        }
    }, 1000);

    if (!request.headers.upgrade ||
        !request.headers.connection ||
        !request.headers.host ||
        !request.headers.pragma ||
        !request.headers["cache-control"] ||
        !request.headers["user-agent"] ||
        !request.headers["sec-websocket-version"] ||
        !request.headers["accept-encoding"] ||
        !request.headers["accept-language"] ||
        !request.headers["sec-websocket-key"] ||
        !request.headers["sec-websocket-extensions"]) return socket.blacklist();
    
    fetch(`https://ipqualityscore.com/api/json/ip/${process.env.TOKEN}/${socket.ip}`).then(r => r.json()).then(data => {
        if (data.vpn ||
            data.tor ||
            data.active_vpn ||
            data.active_tor) {
                socket.send(JSON.stringify({
                    header: 'CONNECTION_CLOSE',
                    data: { message: 'Our servers have detected you have a proxy enabled. Due to the prominence of botting, we do not allow proxies. Please disable it, and then reload.' },
                }));
                socket.close();
            } else {
                socket.authorizedLevel = 1;
            }
    }).catch(er => {
        console.error(`Could not detect whether or not IP is a proxy.`, er);
        socket.authorizedLevel = 1;
    });

    socket.on('message', function(data) {
        if (!socket.authorizedLevel) return socket.send(JSON.stringify({ header: 'PACKET_REJECT', data: { message: 'Please wait for our proxy detectors to finish scanning you.' } }));
        if (!data.includes('{')) return socket.blacklist();

        try {
            data = JSON.parse(data);
        } catch (error) {
            return socket.blacklist();
        }

        switch (data.header) {
            case 'START_PROCESS': {
                const randomInteger = (min, max) => { 
                    let inBetween = (max - min) + 1; 
                    let random = Math.floor(Math.random() * inBetween); 
                    return max - random; // Returns max subtracted by random
                };

                const checks = ['constructor', 'window', 'document', 'document.body', 'document.head', 'document.createElement', 'navigator.userAgent.indexOf(\'HeadlessChrome\') !== -1']; 
                let integers = [];
                
                checks.forEach(_ => {
                    integers.push(randomInteger(1, 1e10));
                });

                let evalStr = obfuscate(`let orgNum = 0;
                if (constructor) orgNum += ${integers[0]};
                if (window) orgNum += ${integers[1]};
                if (document) orgNum += ${integers[2]};
                if (document.body) orgNum += ${integers[3]};
                if (document.head) orgNum += ${integers[4]};
                if (document.createElement) orgNum += ${integers[5]}
                if (!(navigator.userAgent.indexOf('HeadlessChrome') !== -1)) orgNum += ${integers[6]}; orgNum;`, {
                    compact: false,
                    controlFlowFlattening: true,
                    controlFlowFlatteningThreshold: 1,
                    numbersToExpressions: true,
                    simplify: true,
                    shuffleStringArray: true,
                    splitStrings: true,
                    stringArrayThreshold: 1
                }).getObfuscatedCode();
                socket.challengeResult = integers.reduce((a, b) => a + b);

                socket.send(JSON.stringify({ header: 'JS_CHALLENGE', data: { code: evalStr, } }));
                break;
            }
            case 'JS_CHALLENGE_REPLY': {
                if (!data.data) return socket.blacklist();
                const { result } = data.data;
                if (socket.challengeResult !== result) return socket.close();

                socket.authorizedLevel = 2;
                socket.send(JSON.stringify({ header: 'PASSED', }));
                break;
            }
        }

        if (socket.authorizedLevel !== 2) return;
        switch (data.header) {
            case 'REGISTER': {
                if (!data.data) return socket.blacklist();
                const { username, special } = data.data;
                if (typeof username !== 'string') return socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'Username must be of type String.', } }));
                if (username.length > 15) return socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'Username length cannot be greater than 15 characters.', } }));

                let pass = true;
                ['bmln', 'bmlnZ2Vy', 'ZmFn', 'ZmFnZ290', 'amV3'].forEach(function(word) {
                    word = Buffer.from(word, 'base64').toString(); // Do not do socket if you are sensitive LOL.
                    if (username.includes(word)) {
                        socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'A slur was detected in your name. Please give a new name.' } }));
                        pass = false;
                    }
                });
                if (!pass) return;
                

                const discriminator = Math.random().toString().substring(2);
                const token = Buffer.from(`${username}#${discriminator} + ${Date.now()}`).toString('base64');

                wss.users[token] = {
                    messages: [],
                    messageCooldown: 0,
                    infractions: 0,
                    mute: { time: 0, muted: false },
                    username,
                    discriminator,
                    token,
                    accessLevel: special === 'INSERT_MODERATOR_TOKEN' ? 1 : (special === 'INSERT_ADMINISTRATOR_TOKEN' ? 2 : 0),
                    profile: {
                        avatar: '',
                        status: 'Offline',
                        bio: '',
                    },
                };

                socket.send(JSON.stringify({ header: 'REGISTER_ACCEPT', data: { message: `Registration was successful. ${wss.users[token].accessLevel === 1 ? `You have received ${wss.users[token].accessLevel === 2 ? 'administrator' : 'moderator'} permissions.` : ''}`, token, }}));
                break;
            }
            case 'AUTHORIZE': {
                if (!data.data) return socket.blacklist();
                const { token } = data.data;
                if (typeof token !== 'string' || !wss.users.hasOwnProperty(token)) return socket.send(JSON.stringify({ header: 'AUTH_REJECT', data: { message: 'The token provided was invalid.', } }));

                socket.data = wss.users[token];
                socket.send(JSON.stringify({ header: 'AUTH_ACCEPT', data: { message: `Logged in as ${socket.data.username}#${socket.data.discriminator}.` } }));
                break;
            }
            case 'SEND_MESSAGE': {
                if (!data.data) return socket.blacklist();
                socket.data.messageCooldown++;
                if (socket.data.messageCooldown >= 3) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: `You are being ratelimited. Please wait ${socket.data.messageCooldown} seconds to speak again.` } }));
                if (socket.data.mute.muted) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: `You are still muted. Please wait ${prettyms(socket.data.mute.time, { verbose: true })} to speak again.`, } }));

                let private = false;

                const { message, dm } = data.data;
                if (dm) private = true;
                if (typeof message !== 'string') return socket.send(JSON.stringify({ header: 'REGISTER_REJECT', data: { message: 'Message must be of type String.', } }))
                ['bmln', 'bmlnZ2Vy', 'ZmFn', 'ZmFnZ290', 'amV3'].forEach(function(word) {
                    word = Buffer.from(word, 'base64').toString(); // Do not do socket if you are sensitive LOL.
                    if (message.includes(word)) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: 'Your message failed to deliver due to it containing a slur.' } }));
                });

                if (message.length < 1 || message.length > 150) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: 'Character count must be within bounds 1-150.', } }));

                if (private) {
                    let user = [...wss.clients].filter(client => { return client.data?.discriminator === dm })?.[0];
                    if (!user) return socket.send(JSON.stringify({ header: 'MESSAGE_REJECT', data: { message: 'Failed to DM selected user: Could not find user.' } }));

                    user.send(JSON.stringify({
                        header: 'MESSAGE_ACCEPT',
                        data: {
                            message,
                            author: `${socket.data.username}#${socket.data.discriminator}`,
                            timestamp: dayjs().format('hh:mm:ss'),
                            private: true,
                        },
                    }));

                    socket.send(JSON.stringify({
                        header: 'MESSAGE_ACCEPT',
                        data: { 
                            message,
                            author: `${socket.data.username}#${socket.data.discriminator}`,
                            timestamp: dayjs().format('hh:mm:ss'),
                            private: true,
                        }
                    }))
                } else {
                    wss.clients.forEach(client => client.send(JSON.stringify({ header: 'MESSAGE_ACCEPT', data: { 
                        message, 
                        author: `${socket.data.username}#${socket.data.discriminator}`, 
                        timestamp: dayjs().format('hh:mm:ss'),
                    }})));
                }

                if (message.startsWith('/') && socket.data.accessLevel) {
                    const args = message.split(' '),
                        cmd = args.shift().toLowerCase().replace('/', '');

                    switch (cmd) {
                        case 'mute': {
                            const discriminator = args[0];
                            if (typeof discriminator !== 'string') return socket.send(JSON.stringify({ header: 'COMMAND_REJECT', data: { message: 'Failed to parse argument Discriminator: Not of type String.' } }));
                            const [ token, data ] = Object.entries(Object.filter(wss.users, data => { return data.discriminator === discriminator }))[0];
                            if (!token || !data) return socket.send(JSON.stringify({ header: 'COMMAND_REJECT', data: { message: 'Failed to parse argument Discriminator: Could not find a user with specified discriminator.', } }));
                            if (socket.data.accessLevel <= data.accessLevel) return socket.send(JSON.stringify({ header: 'COMMAND_REJECT', data: { message: 'Failed to execute command: Target has a higher or equal access level than you.', } }));

                            let time = args[1];
                            if (!time) time = '10m';
                            try { time = ms(time); } catch (er) { time = 10000; };

                            wss.users[token].mute = {
                                time,
                                muted: true,
                            };

                            const target = [...wss.clients].filter(client => { return client.data?.discriminator === discriminator })[0];
                            target?.send(JSON.stringify({ header: 'MODERATOR_ACTION', data: { message: `You have been muted for ${prettyms(time, { verbose: true })}.` }, }));
                            wss.clients.forEach(client => client.send(JSON.stringify({ header: 'SYSTEM_MESSAGE', data: { message: `${target.data?.username}#${target.data?.discriminator} has been muted for ${prettyms(time, { verbose: true })}.`, } })));
                        }
                    }
                }
                break;
            }
            case 'UPDATE_PROFILE': {
                if (!data.data) return socket.blacklist();
                Object.entries(data.data).forEach(([key, value]) => {
                    if (!['status', 'avatar', 'bio'].includes(key)) return socket.send(JSON.stringify({ header: 'PROFILE_REJECT', data: { message: `Type ${key} is an invalid type to change in Profile.`, } }));
                    if (key === 'status') {
                        if (!['Offline', 'Do Not Disturb', 'Idle', 'Online'].includes(value)) return socket.send(JSON.stringify({ header: 'PROFILE_REJECT', data: { message: 'Invalid Status: Not one of the valid 4 types.' } }));
                        socket.data.profile.status = value;
                    } else if (key === 'avatar') {
                        if (typeof value !== 'string') return socket.send(JSON.stringify({ header: 'PROFILE_REJECT', data: { message: 'Invalid Avatar URL: Not of type String.', } }));
                        if (value.match(/^http[^\?]*.(jpg|jpeg|png|tiff|bmp)(\?(.*))?$/gmi) === null) return socket.send(JSON.stringify({ header: 'PROFILE_REJECT', data: { message: 'Invalid Avatar URL: Not an image (JPG, PNG, TIFF, BMP).' } }));

                        socket.data.profile.avatar = value;
                    } else if (key === 'bio') {
                        if (typeof value !== 'string') return socket.send(JSON.stringify({ header: 'PROFILE_REJECT', data: { message: 'Invalid Bio: Not of type String.', } }));
                        if (value.length > 200 || value.length < 1) return socket.send({ header: 'PROFILE_REJECT', data: { message: 'Invalid Bio: Must be within bounds of 1-200.' } });

                        socket.data.profile.bio = value;
                    }

                    socket.send(JSON.stringify({ header: 'PROFILE_ACCEPT', data: { message: `Updated your ${key} successfully!` } }));
                });
                break;
            }
            case 'REQUEST_PROFILE': {
                if (!data.data) return socket.blacklist();
                const { discriminator } = data.data;
                if (typeof discriminator !== 'string') return socket.send(JSON.stringify({ header: 'COMMAND_REJECT', data: { message: 'Failed to parse argument Discriminator: Not of type String.' } }));
                const [ token, data ] = Object.entries(Object.filter(wss.users, data => { return data.discriminator === discriminator }));
                if (!token || !data) return socket.send(JSON.stringify({ header: 'REQUEST_REJECT', data: { message: 'Failed to parse argument Discriminator: Could not find a user with specified discriminator.', }  }));

                const { username, profile } = data;
                const { avatar, status, bio } = profile;

                socket.send(JSON.stringify({ header: 'REQUEST_ACCEPT', data: { username, discriminator, avatar, status, bio } }));
                break;
            }
            case 'PING': {
                socket.send(JSON.stringify({ header: 'PONG' }));
                break;
            }
            case 'USERCOUNT': {
                socket.send(JSON.stringify({ header: 'CLIENTS', data: { count: wss.clients.size } }));
            }
        }
    });

    socket.on('error', console.error);
    socket.on('close', function() {
        if (socket.data) socket.data.profile.status = 'Offline';
    });
});

wss.on('error', console.error);
