const Bots = [];

const getValidConfig = ({ config }) => {
    const result = {};
    const keys = Object.keys(config);
    for (let index = 0; index < keys.length; index += 1) {
        if (!/^_/.test(keys[index])) {
            result[keys[index]] = config[keys[index]];
        }
    }
    return result;
};

const Bot = class {
    constructor() {
        Bots.push(this);
    }

    init(config) {
        this.config = getValidConfig({ config });
        this.db = config.db;
        this.logger = config.logger;
        this.i18n = config.i18n;
        return Promise.resolve(this);
    }

    ready() {
        this.logger.debug(`${this.name} ready`);
        return Promise.resolve(true);
    }

    static getBot(name) {
        return Promise.resolve(
            Bots.find(bot => new RegExp(`^${name}$`, 'i').test(bot.name))
        );
    }
};

module.exports = Bot;
