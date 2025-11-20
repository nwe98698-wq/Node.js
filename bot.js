const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');
const nodeCron = require('node-cron');

// Bot configuration
const BOT_TOKEN = "8006342815:AAHyl0Aamf5fCyj4u0EgYil0zhUcisFnXq0";
const CHANNEL_USERNAME = "@Vipsafesingalchannel298";
const CHANNEL_LINK = "https://t.me/Vipsafesingalchannel298";
const ADMIN_USER_ID = "6328953001";

// API endpoints
const API_ENDPOINTS = {
    "777": "https://api.bigwinqaz.com/api/webapi/"
};

// Colour Bet Types
const COLOUR_BET_TYPES = {
    "RED": 10,
    "GREEN": 11,
    "VIOLET": 12
};

// Database setup
const DB_NAME = "auto_bot.db";

// Global storage
const userSessions = {};
const issueCheckers = {};
const autoBettingTasks = {};
const waitingForResults = {};
const processedIssues = {};

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_NAME);
        this.initDatabase();
    }

    initDatabase() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                phone TEXT,
                password TEXT,
                platform TEXT DEFAULT '777',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                bet_amount INTEGER DEFAULT 100,
                auto_login BOOLEAN DEFAULT 1,
                bet_sequence TEXT DEFAULT '100,300,700,1600,3200,7600,16000,32000',
                current_bet_index INTEGER DEFAULT 0,
                platform TEXT DEFAULT '777',
                auto_betting BOOLEAN DEFAULT 0,
                random_betting TEXT DEFAULT 'bot',
                profit_target INTEGER DEFAULT 0,
                loss_target INTEGER DEFAULT 0,
                language TEXT DEFAULT 'english',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS allowed_game_ids (
                game_id TEXT PRIMARY KEY,
                added_by INTEGER,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS bet_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                platform TEXT,
                issue TEXT,
                bet_type TEXT,
                amount INTEGER,
                result TEXT,
                profit_loss INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS pending_bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                platform TEXT,
                issue TEXT,
                bet_type TEXT,
                amount INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS bot_sessions (
                user_id INTEGER PRIMARY KEY,
                is_running BOOLEAN DEFAULT 0,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_bets INTEGER DEFAULT 0,
                total_profit INTEGER DEFAULT 0,
                session_profit INTEGER DEFAULT 0,
                session_loss INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS formula_patterns (
                user_id INTEGER PRIMARY KEY,
                bs_pattern TEXT DEFAULT '',
                colour_pattern TEXT DEFAULT '',
                bs_current_index INTEGER DEFAULT 0,
                colour_current_index INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS channel_verification (
                user_id INTEGER PRIMARY KEY,
                has_joined BOOLEAN DEFAULT 0,
                verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS sl_patterns (
                user_id INTEGER PRIMARY KEY,
                pattern TEXT DEFAULT '1,2,3,4,5',
                current_sl INTEGER DEFAULT 1,
                current_index INTEGER DEFAULT 0,
                wait_loss_count INTEGER DEFAULT 0,
                bet_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS sl_bet_sessions (
                user_id INTEGER PRIMARY KEY,
                is_wait_mode BOOLEAN DEFAULT 0,
                wait_bet_type TEXT DEFAULT '',
                wait_issue TEXT DEFAULT '',
                wait_amount INTEGER DEFAULT 0,
                wait_total_profit INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        tables.forEach(table => {
            this.db.run(table);
        });
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

class LotteryAPI {
    constructor(platform = '777') {
        this.platform = platform;
        this.baseUrl = API_ENDPOINTS[platform];
        this.token = '';
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": "https://www.bigwinqaz.com",
            "Referer": "https://www.bigwinqaz.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        };
    }

    signMd5(data) {
        const signData = { ...data };
        delete signData.signature;
        delete signData.timestamp;

        const sortedKeys = Object.keys(signData).sort();
        const sortedData = {};
        sortedKeys.forEach(key => {
            sortedData[key] = signData[key];
        });

        const hashString = JSON.stringify(sortedData).replace(/\s/g, '');
        return crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
    }

    randomKey() {
        const xxxx = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";
        let result = "";
        
        for (let char of xxxx) {
            if (char === 'x') {
                result += '0123456789abcdef'[Math.floor(Math.random() * 16)];
            } else if (char === 'y') {
                result += '89a'[Math.floor(Math.random() * 3)];
            } else {
                result += char;
            }
        }
        return result;
    }

    async login(phone, password) {
        try {
            const body = {
                "phonetype": -1,
                "language": 0,
                "logintype": "mobile",
                "random": "9078efc98754430e92e51da59eb2563c",
                "username": `95${phone}`,
                "pwd": password,
                "timestamp": Math.floor(Date.now() / 1000)
            };

            body.signature = this.signMd5(body);

            const response = await axios.post(`${this.baseUrl}Login`, body, {
                headers: this.headers,
                timeout: 30000
            });

            if (response.status === 200) {
                const result = response.data;
                if (result.msgCode === 0) {
                    const tokenData = result.data || {};
                    this.token = `${tokenData.tokenHeader || ''}${tokenData.token || ''}`;
                    this.headers.Authorization = this.token;
                    return { success: true, message: "Login successful", token: this.token };
                } else {
                    return { success: false, message: result.msg || "Login failed", token: "" };
                }
            } else {
                return { success: false, message: `API connection failed: ${response.status}`, token: "" };
            }
        } catch (error) {
            return { success: false, message: `Login error: ${error.message}`, token: "" };
        }
    }

    async getCurrentIssue() {
        try {
            const body = {
                "typeId": 1,
                "language": 0,
                "random": "b05034ba4a2642009350ee863f29e2e9",
                "timestamp": Math.floor(Date.now() / 1000)
            };
            body.signature = this.signMd5(body);

            const response = await axios.post(`${this.baseUrl}GetGameIssue`, body, {
                headers: this.headers,
                timeout: 10000
            });

            if (response.status === 200) {
                const result = response.data;
                if (result.msgCode === 0) {
                    return result.data?.issueNumber || '';
                }
            }
            return "";
        } catch (error) {
            return "";
        }
    }

    async getBalance() {
        try {
            const body = {
                "language": 0,
                "random": "9078efc98754430e92e51da59eb2563c",
                "timestamp": Math.floor(Date.now() / 1000)
            };
            body.signature = this.signMd5(body);

            const response = await axios.post(`${this.baseUrl}GetBalance`, body, {
                headers: this.headers,
                timeout: 10000
            });

            if (response.status === 200) {
                const result = response.data;
                if (result.msgCode === 0) {
                    return result.data?.amount || 0;
                }
            }
            return 0;
        } catch (error) {
            return 0;
        }
    }

    async getUserInfo() {
        try {
            const body = {
                "language": 0,
                "random": "9078efc98754430e92e51da59eb2563c",
                "timestamp": Math.floor(Date.now() / 1000)
            };
            body.signature = this.signMd5(body);

            const response = await axios.post(`${this.baseUrl}GetUserInfo`, body, {
                headers: this.headers,
                timeout: 10000
            });

            if (response.status === 200) {
                const result = response.data;
                if (result.msgCode === 0) {
                    return result.data || {};
                }
            }
            return {};
        } catch (error) {
            return {};
        }
    }

    async placeBet(amount, betType) {
        try {
            const issueId = await this.getCurrentIssue();
            if (!issueId) {
                return { success: false, message: "Failed to get current issue", issueId: "", potentialProfit: 0 };
            }

            const isColourBet = [10, 11, 12].includes(betType);
            const baseAmount = amount < 10000 ? 10 : Math.pow(10, amount.toString().length - 2);
            const betCount = Math.floor(amount / baseAmount);

            const body = {
                "typeId": 1,
                "issuenumber": issueId,
                "language": 0,
                "gameType": isColourBet ? 0 : 2,
                "amount": baseAmount,
                "betCount": betCount,
                "selectType": betType,
                "random": this.randomKey(),
                "timestamp": Math.floor(Date.now() / 1000)
            };
            body.signature = this.signMd5(body);

            const response = await axios.post(`${this.baseUrl}GameBetting`, body, {
                headers: this.headers,
                timeout: 10000
            });

            if (response.status === 200) {
                const result = response.data;
                if (result.code === 0 || result.msgCode === 0) {
                    const potentialProfit = isColourBet ? Math.floor(amount * 2.5) : Math.floor(amount * 0.96);
                    return { success: true, message: "Bet placed successfully", issueId, potentialProfit };
                } else {
                    const errorMsg = result.msg || 'Bet failed';
                    return { success: false, message: errorMsg, issueId, potentialProfit: 0 };
                }
            }
            return { success: false, message: `API connection failed: ${response.status}`, issueId, potentialProfit: 0 };
        } catch (error) {
            return { success: false, message: `Bet error: ${error.message}`, issueId: "", potentialProfit: 0 };
        }
    }

    async getRecentResults(count = 10) {
        try {
            const body = {
                "pageNo": 1,
                "pageSize": count,
                "language": 0,
                "typeId": 1,
                "random": "6DEB0766860C42151A193692ED16D65A",
                "timestamp": Math.floor(Date.now() / 1000)
            };
            body.signature = this.signMd5(body);

            const response = await axios.post(`${this.baseUrl}GetNoaverageEmerdList`, body, {
                headers: this.headers,
                timeout: 10000
            });

            if (response.status === 200) {
                const result = response.data;
                if (result.msgCode === 0) {
                    const dataStr = JSON.stringify(response.data);
                    const startIdx = dataStr.indexOf('[');
                    const endIdx = dataStr.indexOf(']') + 1;
                    
                    if (startIdx !== -1 && endIdx !== -1) {
                        const resultsJson = dataStr.substring(startIdx, endIdx);
                        const results = JSON.parse(resultsJson);
                        
                        results.forEach(resultItem => {
                            const number = String(resultItem.number || '');
                            if (['0', '5'].includes(number)) {
                                resultItem.colour = 'VIOLET';
                            } else if (['1', '3', '7', '9'].includes(number)) {
                                resultItem.colour = 'GREEN';
                            } else if (['2', '4', '6', '8'].includes(number)) {
                                resultItem.colour = 'RED';
                            } else {
                                resultItem.colour = 'UNKNOWN';
                            }
                        });
                        
                        return results;
                    }
                }
            }
            return [];
        } catch (error) {
            return [];
        }
    }
}

class AutoLotteryBot {
    constructor() {
        this.bot = new TelegramBot(BOT_TOKEN, { polling: true });
        this.db = new Database();
        this.setupHandlers();
    }

    setupHandlers() {
        // Start command
        this.bot.onText(/\/start/, (msg) => this.handleStart(msg));

        // Admin commands
        this.bot.onText(/\/addgameid (.+)/, (msg, match) => this.handleAddGameId(msg, match));
        this.bot.onText(/\/removegameid (.+)/, (msg, match) => this.handleRemoveGameId(msg, match));
        this.bot.onText(/\/listgameids/, (msg) => this.handleListGameIds(msg));
        this.bot.onText(/\/gameidstats/, (msg) => this.handleGameIdStats(msg));

        // Callback queries
        this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));

        // Message handler
        this.bot.on('message', (msg) => this.handleMessage(msg));
    }

    async handleStart(msg) {
        const chatId = msg.chat.id;
        const userId = String(chatId);
        
        // Initialize user session
        userSessions[userId] = {
            step: 'main',
            phone: '',
            password: '',
            platform: '777',
            loggedIn: false,
            apiInstance: null
        };

        const welcomeText = `Auto Lottery Bot

Welcome ${msg.from.first_name}!

Auto Bot Features:
- Random BIG Betting
- Random SMALL Betting  
- Random BIG/SMALL Betting
- Follow Bot (Follow Last Result)
- BS Formula Pattern Betting (B,S only)
- Colour Formula Pattern Betting (G,R,V only)
- SL Layer Pattern Betting
- Bot Statistics Tracking
- Auto Result Checking
- Profit/Loss Targets
- Colour Betting (RED, GREEN, VIOLET)

Platform Support:
- 777 Big Win  

Manual Features:
- Real-time Balance
- Game Results & History

Press Run Bot to start auto betting!`;

        await this.bot.sendMessage(chatId, welcomeText, {
            reply_markup: this.getMainKeyboard(userId)
        });
    }

    getMainKeyboard(userId = null) {
        return {
            keyboard: [
                [{ text: "Login" }],
                [{ text: "Balance" }, { text: "Results" }],
                [{ text: "Bet BIG" }, { text: "Bet SMALL" }],
                [{ text: "Bet RED" }, { text: "Bet GREEN" }, { text: "Bet VIOLET" }],
                [{ text: "Bot Settings" }, { text: "My Bets" }],
                [{ text: "SL Layer" }],
                [{ text: "Language" }, { text: "Bot Info" }],
                [{ text: "Run Bot" }, { text: "Stop Bot" }]
            ],
            resize_keyboard: true
        };
    }

    getBotSettingsKeyboard() {
        return {
            keyboard: [
                [{ text: "Random BIG" }, { text: "Random SMALL" }],
                [{ text: "Random Bot" }, { text: "Follow Bot" }],
                [{ text: "BS Formula" }, { text: "Colour Formula" }],
                [{ text: "Bot Stats" }, { text: "Set Bet Sequence" }],
                [{ text: "Profit Target" }, { text: "Loss Target" }],
                [{ text: "Reset Stats" }, { text: "Main Menu" }]
            ],
            resize_keyboard: true
        };
    }

    getLoginKeyboard() {
        return {
            keyboard: [
                [{ text: "Enter Phone" }, { text: "Enter Password" }],
                [{ text: "Login Now" }, { text: "Back" }]
            ],
            resize_keyboard: true
        };
    }

    async handleCallbackQuery(query) {
        const chatId = query.message.chat.id;
        const userId = String(chatId);

        if (query.data === "check_join") {
            // Handle channel join verification
            await this.bot.answerCallbackQuery(query.id);
            await this.bot.editMessageText("Thank you for joining our channel! You can now use the bot.\n\nPress /start to begin.", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        }
    }

    async handleMessage(msg) {
        if (!msg.text) return;

        const chatId = msg.chat.id;
        const userId = String(chatId);
        const text = msg.text;

        if (!userSessions[userId]) {
            userSessions[userId] = {
                step: 'main',
                phone: '',
                password: '',
                platform: '777',
                loggedIn: false,
                apiInstance: null
            };
        }

        const userSession = userSessions[userId];

        // Handle different steps and commands
        switch (userSession.step) {
            case 'login_phone':
                userSession.phone = text;
                userSession.step = 'login';
                await this.bot.sendMessage(chatId, `Phone number saved: ${text}\nNow please enter your password:`, {
                    reply_markup: this.getLoginKeyboard()
                });
                break;

            case 'login_password':
                userSession.password = text;
                userSession.step = 'login';
                await this.bot.sendMessage(chatId, "Password saved!\nClick 'Login Now' to authenticate.", {
                    reply_markup: this.getLoginKeyboard()
                });
                break;

            case 'set_bet_sequence':
                await this.handleSetBetSequence(chatId, userId, text);
                break;

            default:
                await this.handleCommand(chatId, userId, text);
        }
    }

    async handleCommand(chatId, userId, text) {
        const userSession = userSessions[userId];

        switch (text) {
            case "Login":
                await this.handleBigwinLogin(chatId, userId);
                break;

            case "Enter Phone":
                userSession.step = 'login_phone';
                await this.bot.sendMessage(chatId, "Please enter your phone number (without country code):");
                break;

            case "Enter Password":
                userSession.step = 'login_password';
                await this.bot.sendMessage(chatId, "Please enter your password:");
                break;

            case "Login Now":
                await this.processLogin(chatId, userId);
                break;

            case "Balance":
                await this.handleBalance(chatId, userId);
                break;

            case "Results":
                await this.handleResults(chatId, userId);
                break;

            case "Bet BIG":
                await this.placeBetHandler(chatId, userId, 13);
                break;

            case "Bet SMALL":
                await this.placeBetHandler(chatId, userId, 14);
                break;

            case "Bet RED":
                await this.placeColourBet(chatId, userId, "RED");
                break;

            case "Bet GREEN":
                await this.placeColourBet(chatId, userId, "GREEN");
                break;

            case "Bet VIOLET":
                await this.placeColourBet(chatId, userId, "VIOLET");
                break;

            case "Bot Settings":
                await this.showBotSettings(chatId, userId);
                break;

            case "My Bets":
                await this.showMyBets(chatId, userId);
                break;

            case "Run Bot":
                await this.runBot(chatId, userId);
                break;

            case "Stop Bot":
                await this.stopBot(chatId, userId);
                break;

            case "Random BIG":
                await this.setRandomBig(chatId, userId);
                break;

            case "Random SMALL":
                await this.setRandomSmall(chatId, userId);
                break;

            case "Random Bot":
                await this.setRandomBot(chatId, userId);
                break;

            case "Follow Bot":
                await this.setFollowBot(chatId, userId);
                break;

            case "Set Bet Sequence":
                userSession.step = 'set_bet_sequence';
                const currentSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
                await this.bot.sendMessage(chatId, `Current bet sequence: ${currentSequence}\nEnter new bet sequence (comma separated):`);
                break;

            case "Main Menu":
                userSession.step = 'main';
                await this.bot.sendMessage(chatId, "Main Menu", {
                    reply_markup: this.getMainKeyboard(userId)
                });
                break;

            default:
                await this.bot.sendMessage(chatId, "Please use the buttons below to navigate.", {
                    reply_markup: this.getMainKeyboard(userId)
                });
        }
    }

    async handleBigwinLogin(chatId, userId) {
        const userSession = userSessions[userId];
        userSession.step = 'login';
        userSession.platform = '777';
        userSession.apiInstance = new LotteryAPI('777');

        const loginGuide = `777 Big Win Login

Please follow these steps:

1. Click 'Enter Phone' and send your phone number
2. Click 'Enter Password' and send your password  
3. Click 'Login Now' to authenticate

Your credentials will be saved for future use!`;

        await this.bot.sendMessage(chatId, loginGuide, {
            reply_markup: this.getLoginKeyboard()
        });
    }

    async processLogin(chatId, userId) {
        const userSession = userSessions[userId];
        
        if (!userSession.phone || !userSession.password) {
            await this.bot.sendMessage(chatId, "Please enter phone number and password first!", {
                reply_markup: this.getLoginKeyboard()
            });
            return;
        }

        const loadingMsg = await this.bot.sendMessage(chatId, "Logging in... Please wait.");

        try {
            const result = await userSession.apiInstance.login(userSession.phone, userSession.password);
            
            if (result.success) {
                const userInfo = await userSession.apiInstance.getUserInfo();
                const gameId = userInfo.userId || '';
                
                // Check if game ID is allowed (implement this function)
                if (!await this.isGameIdAllowed(gameId)) {
                    await this.bot.editMessageText(`❌ Login Failed!\n\nGame ID: ${gameId}\nStatus: NOT ALLOWED\n\nPlease contact admin: @Smile_p2`, {
                        chat_id: chatId,
                        message_id: loadingMsg.message_id
                    });
                    return;
                }

                userSession.loggedIn = true;
                userSession.step = 'main';

                const balance = await userSession.apiInstance.getBalance();

                await this.saveUserCredentials(userId, userSession.phone, userSession.password, userSession.platform);
                await this.saveUserSetting(userId, 'auto_login', 1);

                const successText = `✅ Login Successful!

Platform: 777 Big Win
Game ID: ${gameId}
Account: ${userSession.phone}
Balance: ${balance.toLocaleString()} K

Status: ✅ VERIFIED`;

                await this.bot.editMessageText(successText, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id,
                    parse_mode: 'Markdown'
                });

                await this.bot.sendMessage(chatId, "Choose an option:", {
                    reply_markup: this.getMainKeyboard(userId)
                });
            } else {
                await this.bot.editMessageText(`❌ Login failed: ${result.message}`, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id
                });
            }
        } catch (error) {
            await this.bot.editMessageText(`❌ Login error: ${error.message}`, {
                chat_id: chatId,
                message_id: loadingMsg.message_id
            });
        }
    }

    async handleBalance(chatId, userId) {
        const userSession = userSessions[userId];
        
        if (!userSession.loggedIn) {
            await this.bot.sendMessage(chatId, "Please login first!");
            return;
        }

        try {
            const balance = await userSession.apiInstance.getBalance();
            const userInfo = await userSession.apiInstance.getUserInfo();
            const user_id_display = userInfo.userId || 'N/A';

            const currentAmount = await this.getCurrentBetAmount(userId);
            const betSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
            const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);

            const balanceText = `Account Information

Platform: 777 Big Win
User ID: ${user_id_display}
Balance: ${balance.toLocaleString()} K
Status: LOGGED IN

Last update: ${moment().format('HH:mm:ss')}`;

            await this.bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });
        } catch (error) {
            await this.bot.sendMessage(chatId, `Error getting balance: ${error.message}`);
        }
    }

    async handleResults(chatId, userId) {
        const userSession = userSessions[userId];
        const platformName = "777 Big Win";

        try {
            let results;
            if (userSession.apiInstance) {
                results = await userSession.apiInstance.getRecentResults(10);
            } else {
                const api = new LotteryAPI('777');
                results = await api.getRecentResults(10);
            }

            if (!results || results.length === 0) {
                await this.bot.sendMessage(chatId, "No recent results available.");
                return;
            }

            let resultsText = `Recent Game Results - ${platformName}\n\n`;
            results.forEach((result, i) => {
                const issueNo = result.issueNumber || 'N/A';
                const number = result.number || 'N/A';
                const resultType = ['0','1','2','3','4'].includes(number) ? "SMALL" : "BIG";
                const colour = result.colour || 'UNKNOWN';

                resultsText += `${i+1}. ${issueNo} - ${number} - ${resultType} ${colour}\n`;
            });

            resultsText += `\nLast updated: ${moment().format('YYYY-MM-DD HH:mm:ss')}`;

            await this.bot.sendMessage(chatId, resultsText, { parse_mode: 'Markdown' });
        } catch (error) {
            await this.bot.sendMessage(chatId, `Error getting results: ${error.message}`);
        }
    }

    async placeBetHandler(chatId, userId, betType) {
        const userSession = userSessions[userId];
        
        if (!userSession.loggedIn) {
            await this.bot.sendMessage(chatId, "Please login first!");
            return;
        }

        try {
            const currentIssue = await userSession.apiInstance.getCurrentIssue();
            if (!currentIssue) {
                await this.bot.sendMessage(chatId, "Cannot get current game issue. Please try again.");
                return;
            }

            if (await this.hasUserBetOnIssue(userId, userSession.platform, currentIssue)) {
                await this.bot.sendMessage(chatId, `Wait for next period\n\nYou have already placed a bet on issue ${currentIssue}.\nPlease wait for the next game period to place another bet.`, {
                    parse_mode: 'Markdown'
                });
                return;
            }

            const amount = await this.getCurrentBetAmount(userId);
            const betTypeStr = betType === 13 ? "BIG" : "SMALL";
            const betSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
            const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);

            const balance = await userSession.apiInstance.getBalance();
            if (balance < amount) {
                await this.bot.sendMessage(chatId, `Insufficient balance! You have ${balance.toLocaleString()} K but need ${amount.toLocaleString()} K`);
                return;
            }

            const loadingMsg = await this.bot.sendMessage(chatId, `Placing ${betTypeStr} bet...\nPlatform: 777 Big Win\nIssue: ${currentIssue}\nAmount: ${amount.toLocaleString()} K (Step ${currentIndex + 1})`);

            const result = await userSession.apiInstance.placeBet(amount, betType);
            
            if (result.success) {
                await this.savePendingBet(userId, userSession.platform, result.issueId, betTypeStr, amount);
                
                if (!issueCheckers[userId]) {
                    this.startIssueChecker(userId);
                }

                const betText = `Bet Placed Successfully!

Platform: 777 Big Win
Issue: ${result.issueId}
Type: ${betTypeStr}
Amount: ${amount.toLocaleString()} K (Step ${currentIndex + 1})`;

                await this.bot.editMessageText(betText, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id,
                    parse_mode: 'Markdown'
                });
            } else {
                await this.bot.editMessageText(`Bet failed: ${result.message}`, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id
                });
            }
        } catch (error) {
            await this.bot.sendMessage(chatId, `Bet error: ${error.message}`);
        }
    }

    async placeColourBet(chatId, userId, colour) {
        const userSession = userSessions[userId];
        
        if (!userSession.loggedIn) {
            await this.bot.sendMessage(chatId, "Please login first!");
            return;
        }

        try {
            const currentIssue = await userSession.apiInstance.getCurrentIssue();
            if (!currentIssue) {
                await this.bot.sendMessage(chatId, "Cannot get current game issue. Please try again.");
                return;
            }

            if (await this.hasUserBetOnIssue(userId, userSession.platform, currentIssue)) {
                await this.bot.sendMessage(chatId, `Wait for next period\n\nYou have already placed a bet on issue ${currentIssue}.\nPlease wait for the next game period to place another bet.`, {
                    parse_mode: 'Markdown'
                });
                return;
            }

            const amount = await this.getCurrentBetAmount(userId);
            const betType = COLOUR_BET_TYPES[colour];
            const betSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
            const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);

            const balance = await userSession.apiInstance.getBalance();
            if (balance < amount) {
                await this.bot.sendMessage(chatId, `Insufficient balance! You have ${balance.toLocaleString()} K but need ${amount.toLocaleString()} K`);
                return;
            }

            const loadingMsg = await this.bot.sendMessage(chatId, `Placing ${colour} bet...\nPlatform: 777 Big Win\nIssue: ${currentIssue}\nAmount: ${amount.toLocaleString()} K (Step ${currentIndex + 1})`);

            const result = await userSession.apiInstance.placeBet(amount, betType);
            
            if (result.success) {
                const betTypeStr = `${colour}`;
                await this.savePendingBet(userId, userSession.platform, result.issueId, betTypeStr, amount);
                
                if (!issueCheckers[userId]) {
                    this.startIssueChecker(userId);
                }

                const betText = `Colour Bet Placed Successfully!

Platform: 777 Big Win
Issue: ${result.issueId}
Type: ${colour}
Amount: ${amount.toLocaleString()} K (Step ${currentIndex + 1})`;

                await this.bot.editMessageText(betText, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id,
                    parse_mode: 'Markdown'
                });
            } else {
                await this.bot.editMessageText(`${colour} bet failed: ${result.message}`, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id
                });
            }
        } catch (error) {
            await this.bot.sendMessage(chatId, `${colour} bet error: ${error.message}`);
        }
    }

    async showBotSettings(chatId, userId) {
        try {
            const randomMode = await this.getUserSetting(userId, 'random_betting', 'bot');
            const betSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
            const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);
            const currentAmount = await this.getCurrentBetAmount(userId);

            const botSession = await this.getBotSession(userId);

            const modeText = {
                'big': "Random BIG Only",
                'small': "Random SMALL Only", 
                'bot': "Random Bot",
                'follow': "Follow Bot"
            }[randomMode] || "Random Bot";

            const settingsText = `Bot Settings

Current Settings:
- Betting Mode: ${modeText}
- Bet Sequence: ${betSequence}
- Current Bet: ${currentAmount} K (Step ${currentIndex + 1})
- Bot Status: ${botSession.is_running ? 'RUNNING' : 'STOPPED'}

Bot Statistics:
- Session Profit: ${botSession.session_profit.toLocaleString()} K
- Session Loss: ${botSession.session_loss.toLocaleString()} K
- Net Profit: ${(botSession.session_profit - botSession.session_loss).toLocaleString()} K

Choose your betting mode:`;

            await this.bot.sendMessage(chatId, settingsText, {
                reply_markup: this.getBotSettingsKeyboard(),
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await this.bot.sendMessage(chatId, "Error loading bot settings. Please try again.");
        }
    }

    async showMyBets(chatId, userId) {
        const userSession = userSessions[userId];
        
        if (!userSession.loggedIn) {
            await this.bot.sendMessage(chatId, "Please login first!");
            return;
        }

        try {
            const platform = userSession.platform || '777';
            const myBets = await this.getBetHistory(userId, platform, 10);
            
            if (!myBets || myBets.length === 0) {
                await this.bot.sendMessage(chatId, "No bet history found.");
                return;
            }

            let betsText = `Your Recent Bets - 777 Big Win\n\n`;
            myBets.forEach((bet, i) => {
                const [platform_bet, issue, bet_type, amount, result, profit_loss, created_at] = bet;
                
                let resultText;
                if (result === "WIN") {
                    const totalWinAmount = amount + profit_loss;
                    resultText = `WIN (+${totalWinAmount.toLocaleString()}K)`;
                } else if (result === "LOSE") {
                    resultText = `LOSE (-${amount.toLocaleString()}K)`;
                } else {
                    resultText = "PENDING";
                }
                
                const timeStr = created_at.split(' ')[1]?.substring(0, 5) || created_at.substring(11, 16);
                betsText += `${i+1}. ${issue} - ${bet_type} - ${amount.toLocaleString()}K - ${resultText}\n`;
            });

            await this.bot.sendMessage(chatId, betsText, { parse_mode: 'Markdown' });
        } catch (error) {
            await this.bot.sendMessage(chatId, "Error getting bet history. Please try again.");
        }
    }

    async runBot(chatId, userId) {
        const userSession = userSessions[userId];
        
        if (!userSession.loggedIn) {
            await this.bot.sendMessage(chatId, "Please login first!");
            return;
        }

        if (autoBettingTasks[userId]) {
            await this.bot.sendMessage(chatId, "Bot is already running!");
            return;
        }

        autoBettingTasks[userId] = true;
        waitingForResults[userId] = false;

        await this.resetSessionStats(userId);
        await this.saveBotSession(userId, true);

        const randomMode = await this.getUserSetting(userId, 'random_betting', 'bot');
        const modeText = {
            'big': "Random BIG Only",
            'small': "Random SMALL Only", 
            'bot': "Random Bot",
            'follow': "Follow Bot"
        }[randomMode] || "Random Bot";

        await this.bot.sendMessage(chatId, `Auto Bot Started!\n\nMode: ${modeText}\nStatus: RUNNING\n\nBot will start placing bets automatically.`, {
            parse_mode: 'Markdown'
        });

        this.startAutoBetting(userId);
    }

    async stopBot(chatId, userId) {
        if (autoBettingTasks[userId]) {
            delete autoBettingTasks[userId];
        }
        if (waitingForResults[userId]) {
            delete waitingForResults[userId];
        }
        if (issueCheckers[userId]) {
            delete issueCheckers[userId];
        }

        await this.db.run('DELETE FROM pending_bets WHERE user_id = ?', [userId]);
        await this.saveBotSession(userId, false);

        await this.bot.sendMessage(chatId, `Auto Bot Stopped!\n\nStatus: STOPPED\n\nAll betting activities have been stopped immediately.\nPending bets have been cleared.`, {
            parse_mode: 'Markdown'
        });
    }

    async setRandomBig(chatId, userId) {
        await this.saveUserSetting(userId, 'random_betting', 'big');
        await this.clearFormulaPatterns(userId);
        
        await this.bot.sendMessage(chatId, "Random Mode Set\n\n- Random BIG - Always bet BIG\n\nBot will now always bet BIG in auto mode.");
    }

    async setRandomSmall(chatId, userId) {
        await this.saveUserSetting(userId, 'random_betting', 'small');
        await this.clearFormulaPatterns(userId);
        
        await this.bot.sendMessage(chatId, "Random Mode Set\n\n- Random SMALL - Always bet SMALL\n\nBot will now always bet SMALL in auto mode.");
    }

    async setRandomBot(chatId, userId) {
        await this.saveUserSetting(userId, 'random_betting', 'bot');
        await this.clearFormulaPatterns(userId);
        
        await this.bot.sendMessage(chatId, "Random Mode Set\n\n- Random Bot - Random BIG/SMALL\n\nBot will now randomly choose between BIG and SMALL in auto mode.");
    }

    async setFollowBot(chatId, userId) {
        await this.saveUserSetting(userId, 'random_betting', 'follow');
        await this.clearFormulaPatterns(userId);
        
        await this.bot.sendMessage(chatId, "Random Mode Set\n\n- Follow Bot - Follow Last Result\n\nBot will now follow the last game result in auto mode.");
    }

    async handleSetBetSequence(chatId, userId, text) {
        try {
            const amounts = text.split(',').map(x => parseInt(x.trim()));
            if (amounts.length === 0 || amounts.some(isNaN)) {
                await this.bot.sendMessage(chatId, "Please enter valid numbers separated by commas (e.g., 100,300,700,1600,3200,7600,16000,32000)");
                return;
            }

            if (amounts.some(amount => amount < 10)) {
                await this.bot.sendMessage(chatId, "Minimum bet amount is 10 K");
                return;
            }

            const betSequence = amounts.join(',');
            await this.saveUserSetting(userId, 'bet_sequence', betSequence);
            await this.saveUserSetting(userId, 'current_bet_index', 0);

            userSessions[userId].step = 'main';
            await this.bot.sendMessage(chatId, `Bet sequence set to: ${betSequence}\nStarting from first amount: ${amounts[0]} K`, {
                reply_markup: this.getMainKeyboard(userId)
            });
        } catch (error) {
            await this.bot.sendMessage(chatId, "Please enter valid numbers separated by commas (e.g., 100,300,700,1600,3200,7600,16000,32000)");
        }
    }

    // Database helper methods
    async saveUserCredentials(userId, phone, password, platform = '777') {
        await this.db.run(
            'INSERT OR REPLACE INTO users (user_id, phone, password, platform) VALUES (?, ?, ?, ?)',
            [userId, phone, password, platform]
        );
    }

    async getUserCredentials(userId) {
        return await this.db.get(
            'SELECT phone, password, platform FROM users WHERE user_id = ?',
            [userId]
        );
    }

    async saveUserSetting(userId, key, value) {
        // Check if user exists in settings
        const existing = await this.db.get('SELECT user_id FROM user_settings WHERE user_id = ?', [userId]);
        if (!existing) {
            await this.db.run('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
        }

        await this.db.run(`UPDATE user_settings SET ${key} = ? WHERE user_id = ?`, [value, userId]);
    }

    async getUserSetting(userId, key, defaultValue = null) {
        try {
            const result = await this.db.get(`SELECT ${key} FROM user_settings WHERE user_id = ?`, [userId]);
            return result ? result[key] : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    async getCurrentBetAmount(userId) {
        try {
            const betSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
            const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);
            
            const amounts = betSequence.split(',').map(x => parseInt(x.trim()));
            
            if (currentIndex < amounts.length) {
                return amounts[currentIndex];
            } else {
                const amount = amounts[0] || 100;
                await this.saveUserSetting(userId, 'current_bet_index', 0);
                return amount;
            }
        } catch (error) {
            return 100;
        }
    }

    async updateBetSequence(userId, result) {
        try {
            const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);
            const betSequence = await this.getUserSetting(userId, 'bet_sequence', '100,300,700,1600,3200,7600,16000,32000');
            const amounts = betSequence.split(',').map(x => parseInt(x.trim()));

            let newIndex;
            if (result === "WIN") {
                newIndex = 0;
            } else {
                newIndex = currentIndex + 1;
                if (newIndex >= amounts.length) {
                    newIndex = 0;
                }
            }

            await this.saveUserSetting(userId, 'current_bet_index', newIndex);
            return newIndex;
        } catch (error) {
            return 0;
        }
    }

    async savePendingBet(userId, platform, issue, betType, amount) {
        await this.db.run(
            'INSERT INTO pending_bets (user_id, platform, issue, bet_type, amount) VALUES (?, ?, ?, ?, ?)',
            [userId, platform, issue, betType, amount]
        );
    }

    async hasUserBetOnIssue(userId, platform, issue) {
        const result = await this.db.get(
            'SELECT issue FROM pending_bets WHERE user_id = ? AND platform = ? AND issue = ?',
            [userId, platform, issue]
        );
        return result !== undefined;
    }

    async getBetHistory(userId, platform = null, limit = 10) {
        if (platform) {
            return await this.db.all(
                'SELECT platform, issue, bet_type, amount, result, profit_loss, created_at FROM bet_history WHERE user_id = ? AND platform = ? ORDER BY created_at DESC LIMIT ?',
                [userId, platform, limit]
            );
        } else {
            return await this.db.all(
                'SELECT platform, issue, bet_type, amount, result, profit_loss, created_at FROM bet_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit]
            );
        }
    }

    async saveBotSession(userId, isRunning = false, totalBets = 0, totalProfit = 0, sessionProfit = 0, sessionLoss = 0) {
        await this.db.run(
            'INSERT OR REPLACE INTO bot_sessions (user_id, is_running, total_bets, total_profit, session_profit, session_loss, last_activity) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [userId, isRunning ? 1 : 0, totalBets, totalProfit, sessionProfit, sessionLoss]
        );
    }

    async getBotSession(userId) {
        const result = await this.db.get(
            'SELECT is_running, total_bets, total_profit, session_profit, session_loss FROM bot_sessions WHERE user_id = ?',
            [userId]
        );
        
        if (result) {
            return {
                is_running: Boolean(result.is_running),
                total_bets: result.total_bets || 0,
                total_profit: result.total_profit || 0,
                session_profit: result.session_profit || 0,
                session_loss: result.session_loss || 0
            };
        }
        
        return { is_running: false, total_bets: 0, total_profit: 0, session_profit: 0, session_loss: 0 };
    }

    async resetSessionStats(userId) {
        await this.saveBotSession(userId, false, 0, 0, 0, 0);
    }

    async updateBotStats(userId, profit = 0) {
        const session = await this.getBotSession(userId);
        const newTotalBets = session.total_bets + 1;
        const newTotalProfit = session.total_profit + profit;
        
        let newSessionProfit = session.session_profit;
        let newSessionLoss = session.session_loss;
        
        if (profit > 0) {
            newSessionProfit += profit;
        } else {
            newSessionLoss += Math.abs(profit);
        }
        
        await this.saveBotSession(userId, true, newTotalBets, newTotalProfit, newSessionProfit, newSessionLoss);
    }

    async clearFormulaPatterns(userId, patternType = null) {
        if (patternType === 'bs') {
            await this.db.run('UPDATE formula_patterns SET bs_pattern = "", bs_current_index = 0 WHERE user_id = ?', [userId]);
        } else if (patternType === 'colour') {
            await this.db.run('UPDATE formula_patterns SET colour_pattern = "", colour_current_index = 0 WHERE user_id = ?', [userId]);
        } else {
            await this.db.run('UPDATE formula_patterns SET bs_pattern = "", colour_pattern = "", bs_current_index = 0, colour_current_index = 0 WHERE user_id = ?', [userId]);
        }
    }

    async isGameIdAllowed(gameId) {
        const allowedIds = await this.getAllowedGameIds();
        const gameIdStr = String(gameId).trim();
        const allowedIdsStr = allowedIds.map(id => String(id).trim());
        return allowedIdsStr.includes(gameIdStr);
    }

    async getAllowedGameIds() {
        const results = await this.db.all('SELECT game_id FROM allowed_game_ids ORDER BY added_at DESC');
        return results.map(row => row.game_id);
    }

    // Admin command handlers
    async handleAddGameId(msg, match) {
        const chatId = msg.chat.id;
        const userId = String(chatId);

        if (userId !== ADMIN_USER_ID) {
            await this.bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
            return;
        }

        const gameId = match[1];
        if (!gameId || !/^\d+$/.test(gameId)) {
            await this.bot.sendMessage(chatId, "❌ Game ID must contain only numbers.");
            return;
        }

        try {
            await this.db.run(
                'INSERT OR REPLACE INTO allowed_game_ids (game_id, added_by) VALUES (?, ?)',
                [gameId, userId]
            );
            await this.bot.sendMessage(chatId, `✅ Game ID '${gameId}' added successfully!`);
        } catch (error) {
            await this.bot.sendMessage(chatId, "❌ Failed to add game ID.");
        }
    }

    async handleRemoveGameId(msg, match) {
        const chatId = msg.chat.id;
        const userId = String(chatId);

        if (userId !== ADMIN_USER_ID) {
            await this.bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
            return;
        }

        const gameId = match[1];
        try {
            await this.db.run('DELETE FROM allowed_game_ids WHERE game_id = ?', [gameId]);
            await this.bot.sendMessage(chatId, `✅ Game ID '${gameId}' removed successfully!`);
        } catch (error) {
            await this.bot.sendMessage(chatId, "❌ Failed to remove game ID.");
        }
    }

    async handleListGameIds(msg) {
        const chatId = msg.chat.id;
        const userId = String(chatId);

        if (userId !== ADMIN_USER_ID) {
            await this.bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
            return;
        }

        const gameIds = await this.getAllowedGameIds();
        if (gameIds.length === 0) {
            await this.bot.sendMessage(chatId, "📝 No game IDs found.");
            return;
        }

        let gameIdsText = "📋 Allowed Game IDs:\n\n";
        gameIds.forEach((gameId, i) => {
            gameIdsText += `${i+1}. \`${gameId}\`\n`;
        });

        gameIdsText += `\nTotal: ${gameIds.length} game IDs`;
        await this.bot.sendMessage(chatId, gameIdsText, { parse_mode: 'Markdown' });
    }

    async handleGameIdStats(msg) {
        const chatId = msg.chat.id;
        const userId = String(chatId);

        if (userId !== ADMIN_USER_ID) {
            await this.bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
            return;
        }

        const gameIds = await this.getAllowedGameIds();
        const totalIds = gameIds.length;

        let statsText = `📊 Game ID Statistics\n\nTotal Allowed Game IDs: ${totalIds}\n\nRecent Game IDs:\n`;

        const recentIds = gameIds.slice(0, 10);
        recentIds.forEach((gameId, i) => {
            statsText += `${i+1}. \`${gameId}\`\n`;
        });

        if (totalIds > 10) {
            statsText += `\n... and ${totalIds - 10} more`;
        }

        await this.bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
    }

    // Auto betting loop
    startAutoBetting(userId) {
        const userSession = userSessions[userId];
        if (!userSession || !userSession.apiInstance) return;

        let lastIssue = "";
        let consecutiveFailures = 0;
        const maxFailures = 3;

        const bettingLoop = async () => {
            if (!autoBettingTasks[userId]) return;

            try {
                if (waitingForResults[userId]) {
                    setTimeout(bettingLoop, 5000);
                    return;
                }

                const currentIssue = await userSession.apiInstance.getCurrentIssue();
                
                if (currentIssue && currentIssue !== lastIssue) {
                    console.log(`New issue detected: ${currentIssue} for user ${userId}`);
                    
                    setTimeout(async () => {
                        if (!(await this.hasUserBetOnIssue(userId, userSession.platform, currentIssue))) {
                            await this.placeAutoBet(userId, currentIssue);
                            lastIssue = currentIssue;
                            consecutiveFailures = 0;
                        } else {
                            console.log(`User ${userId} already bet on issue ${currentIssue}`);
                        }
                        bettingLoop();
                    }, 3000);
                } else {
                    setTimeout(bettingLoop, 5000);
                }
            } catch (error) {
                console.error(`Auto betting error for user ${userId}:`, error);
                consecutiveFailures++;
                if (consecutiveFailures >= maxFailures) {
                    this.bot.sendMessage(userId, "Auto Bot Stopped - Too many errors!").catch(console.error);
                    delete autoBettingTasks[userId];
                    delete waitingForResults[userId];
                    this.saveBotSession(userId, false);
                } else {
                    setTimeout(bettingLoop, 10000);
                }
            }
        };

        bettingLoop();
    }

    async placeAutoBet(userId, issue) {
        const userSession = userSessions[userId];
        if (!userSession.loggedIn) return;

        waitingForResults[userId] = true;

        const randomMode = await this.getUserSetting(userId, 'random_betting', 'bot');
        let betType, betTypeStr;

        if (randomMode === 'big') {
            betType = 13;
            betTypeStr = "BIG";
        } else if (randomMode === 'small') {
            betType = 14;
            betTypeStr = "SMALL";
        } else if (randomMode === 'follow') {
            const followResult = await this.getFollowBetType(userSession.apiInstance);
            betType = followResult.betType;
            betTypeStr = followResult.betTypeStr;
        } else {
            betType = Math.random() < 0.5 ? 13 : 14;
            betTypeStr = betType === 13 ? "BIG" : "SMALL";
        }

        const amount = await this.getCurrentBetAmount(userId);
        const balance = await userSession.apiInstance.getBalance();

        if (amount > 0 && balance < amount) {
            this.bot.sendMessage(userId, `Auto Bot Stopped - Insufficient Balance!\n\nNeed: ${amount.toLocaleString()} K\nAvailable: ${balance.toLocaleString()} K`, {
                parse_mode: 'Markdown'
            }).catch(console.error);
            delete autoBettingTasks[userId];
            delete waitingForResults[userId];
            return;
        }

        try {
            const result = await userSession.apiInstance.placeBet(amount, betType);
            
            if (result.success) {
                await this.savePendingBet(userId, userSession.platform, result.issueId, betTypeStr, amount);
                await this.updateBotStats(userId);
                
                if (!issueCheckers[userId]) {
                    this.startIssueChecker(userId);
                }

                const currentIndex = await this.getUserSetting(userId, 'current_bet_index', 0);
                const betText = `Auto Bet Placed!\n\nIssue: ${result.issueId}\nType: ${betTypeStr}\nAmount: ${amount.toLocaleString()} K (Step ${currentIndex + 1})`;

                this.bot.sendMessage(userId, betText, { parse_mode: 'Markdown' }).catch(console.error);
            } else {
                this.bot.sendMessage(userId, `Auto Bet Failed\n\nError: ${result.message}`, {
                    parse_mode: 'Markdown'
                }).catch(console.error);
                waitingForResults[userId] = false;
            }
        } catch (error) {
            console.error(`Auto bet placement error:`, error);
            waitingForResults[userId] = false;
        }
    }

    async getFollowBetType(apiInstance) {
        try {
            const results = await apiInstance.getRecentResults(1);
            if (!results || results.length === 0) {
                const betType = Math.random() < 0.5 ? 13 : 14;
                return { betType, betTypeStr: betType === 13 ? "BIG" : "SMALL" };
            }

            const lastResult = results[0];
            const number = lastResult.number || '';
            
            if (['0','1','2','3','4'].includes(number)) {
                return { betType: 14, betTypeStr: "SMALL (Follow)" };
            } else {
                return { betType: 13, betTypeStr: "BIG (Follow)" };
            }
        } catch (error) {
            const betType = Math.random() < 0.5 ? 13 : 14;
            return { betType, betTypeStr: betType === 13 ? "BIG" : "SMALL" };
        }
    }

    startIssueChecker(userId) {
        if (issueCheckers[userId]) return;

        issueCheckers[userId] = true;
        console.log(`Started issue checker for user ${userId}`);

        const userSession = userSessions[userId];
        if (!userSession.apiInstance) return;

        let lastCheckedIssue = '';

        const checkLoop = async () => {
            if (!issueCheckers[userId]) return;

            try {
                const currentIssue = await userSession.apiInstance.getCurrentIssue();
                
                if (currentIssue && currentIssue !== lastCheckedIssue) {
                    console.log(`Issue changed from ${lastCheckedIssue} to ${currentIssue}, checking results for user ${userId}`);
                    await this.checkPendingBets(userId, lastCheckedIssue);
                    lastCheckedIssue = currentIssue;
                }

                setTimeout(checkLoop, 5000);
            } catch (error) {
                console.error(`Issue checker error for user ${userId}:`, error);
                delete issueCheckers[userId];
            }
        };

        // Get initial issue
        userSession.apiInstance.getCurrentIssue().then(issue => {
            lastCheckedIssue = issue;
            checkLoop();
        });
    }

    async checkPendingBets(userId, previousIssue) {
        try {
            const userSession = userSessions[userId];
            const platform = userSession.platform || '777';

            const pendingBets = await this.db.all(
                'SELECT platform, issue, bet_type, amount FROM pending_bets WHERE user_id = ? AND platform = ? ORDER BY created_at DESC',
                [userId, platform]
            );

            for (const bet of pendingBets) {
                if (bet.issue === previousIssue && bet.platform === platform) {
                    await this.checkSingleBetResult(userId, bet.issue, bet.bet_type, bet.amount, platform);
                }
            }
        } catch (error) {
            console.error(`Error checking pending bets for user ${userId}:`, error);
        }
    }

    async checkSingleBetResult(userId, issue, betTypeStr, amount, platform) {
        try {
            const userSession = userSessions[userId];
            if (!userSession.apiInstance) return;

            const results = await userSession.apiInstance.getRecentResults(5);
            let betResult = "UNKNOWN";
            let profitLoss = 0;
            let totalWinAmount = 0;
            let number = "";
            let actualResult = "";

            for (const result of results) {
                if (result.issueNumber === issue) {
                    number = result.number || 'N/A';
                    const colour = (result.colour || '').toUpperCase();

                    if (betTypeStr.includes("BIG")) {
                        if (['5','6','7','8','9'].includes(number)) {
                            actualResult = "BIG";
                            betResult = "WIN";
                        } else {
                            actualResult = "SMALL";
                            betResult = "LOSE";
                        }
                    } else if (betTypeStr.includes("SMALL")) {
                        if (['0','1','2','3','4'].includes(number)) {
                            actualResult = "SMALL";
                            betResult = "WIN";
                        } else {
                            actualResult = "BIG";
                            betResult = "LOSE";
                        }
                    } else if (betTypeStr.includes("RED")) {
                        if (['0','2','4','6','8'].includes(number)) {
                            actualResult = "RED";
                            betResult = "WIN";
                        } else {
                            actualResult = "OTHER";
                            betResult = "LOSE";
                        }
                    } else if (betTypeStr.includes("GREEN")) {
                        if (['1','3','7','9'].includes(number)) {
                            actualResult = "GREEN";
                            betResult = "WIN";
                        } else {
                            actualResult = "OTHER";
                            betResult = "LOSE";
                        }
                    } else if (betTypeStr.includes("VIOLET")) {
                        if (['0','5'].includes(number)) {
                            actualResult = "VIOLET";
                            betResult = "WIN";
                        } else {
                            actualResult = "OTHER";
                            betResult = "LOSE";
                        }
                    }

                    if (betResult === "WIN") {
                        if (betTypeStr.includes("RED") || betTypeStr.includes("GREEN") || betTypeStr.includes("VIOLET")) {
                            const profitAmount = Math.floor(amount * 1.5);
                            profitLoss = profitAmount;
                            totalWinAmount = amount + profitAmount;
                        } else {
                            const profitAmount = Math.floor(amount * 0.96);
                            profitLoss = profitAmount;
                            totalWinAmount = amount + profitAmount;
                        }
                        await this.updateBotStats(userId, profitAmount);
                    } else {
                        profitLoss = -amount;
                        await this.updateBotStats(userId, -amount);
                    }
                    break;
                }
            }

            if (betResult === "UNKNOWN") return;

            // Save bet history and remove pending bet
            await this.db.run(
                'INSERT INTO bet_history (user_id, platform, issue, bet_type, amount, result, profit_loss) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, platform, issue, betTypeStr, amount, betResult, profitLoss]
            );

            await this.db.run(
                'DELETE FROM pending_bets WHERE user_id = ? AND platform = ? AND issue = ?',
                [userId, platform, issue]
            );

            // Update bet sequence
            await this.updateBetSequence(userId, betResult);

            const botSession = await this.getBotSession(userId);

            let resultMessage;
            if (betResult === "WIN") {
                resultMessage = `BET RESULT UPDATE\n\nIssue: ${issue}\nBet Type: ${betTypeStr}\nAmount: ${amount.toLocaleString()} K\nResult: WIN\nProfit: +${profitLoss.toLocaleString()} K\nTotal Win: ${totalWinAmount.toLocaleString()} K\n\nTotal Profit: ${botSession.total_profit.toLocaleString()} K`;
            } else {
                resultMessage = `BET RESULT UPDATE\n\nIssue: ${issue}\nBet Type: ${betTypeStr}\nAmount: ${amount.toLocaleString()} K\nResult: LOSE\nLoss: -${amount.toLocaleString()} K\n\nTotal Profit: ${botSession.total_profit.toLocaleString()} K`;
            }

            this.bot.sendMessage(userId, resultMessage, { parse_mode: 'Markdown' }).catch(console.error);

            if (waitingForResults[userId]) {
                waitingForResults[userId] = false;
            }
        } catch (error) {
            console.error(`Error checking single bet result:`, error);
            if (waitingForResults[userId]) {
                waitingForResults[userId] = false;
            }
        }
    }
}

// Start the bot
const bot = new AutoLotteryBot();

console.log("Auto Lottery Bot starting...");
console.log("Game ID Restriction System: ✅ ENABLED");
console.log("Admin Commands: /addgameid, /removegameid, /listgameids, /gameidstats");
console.log(`Admin User ID: ${ADMIN_USER_ID}`);
console.log("Features: Wait for Win/Loss before next bet");
console.log("Modes: BIG Only, SMALL Only, Random Bot, Follow Bot");
console.log("Bet Sequence System: 100,300,700,1600,3200,7600,16000,32000");
console.log("Profit/Loss Target System");
console.log("Auto Statistics Tracking");
console.log("Colour Betting Support (RED, GREEN, VIOLET)");
console.log("Supported Platform: 777 Big Win ONLY");
console.log("Press Ctrl+C to stop.");

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    process.exit();
});