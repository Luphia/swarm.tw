const fs = require('fs');
const path = require('path');
const dvalue = require('dvalue');
const packageInfo = require('../package.json');

const TOKEN = ['^default.', '.config$'];

const getHomePath = () => path.join(process.env.HOME || process.env.USERPROFILE, packageInfo.name);

const ConfigReader = class {
    static get defFolderPath() {
        return path.join(__dirname, '../config');
    }

    static get customFolderPath() {
        return path.join(getHomePath(), 'config/');
    }

    static isConfigPath({ filePath }) {
        return !TOKEN.find(v => !new RegExp(v).test(filePath));
    }

    static read({ defFolderPath = ConfigReader.defFolderPath, customFolderPath = ConfigReader.customFolderPath }) {
        const result = {};
        const EXT = '.config';
        const defFiles = fs.readdirSync(defFolderPath);
        for (let index = 0; index < defFiles.length; index += 1) {
            const filePath = defFiles[index];
            if (ConfigReader.isConfigPath({ filePath })) {
                const tag = filePath.substr(
                    TOKEN[0].length - 1,
                    filePath.length - TOKEN.reduce((prev, curr) => (prev + curr.length) - 1,
                    0
                ));
                const defaultConfigFilePath = path.join(defFolderPath, filePath);
                const customConfigFilePath = path.join(customFolderPath, tag + EXT);

                // read default config
                const defaultConfigFile = fs.readFileSync(defaultConfigFilePath);
                const defaultConfig = JSON.parse(defaultConfigFile);

                // read custom config
                let customConfig = defaultConfig;
                if (fs.existsSync(customConfigFilePath)) {
                    customConfig = JSON.parse(fs.readFileSync(customConfigFilePath));
                } else {
                    fs.writeFile(customConfigFilePath, defaultConfigFile, () => {});
                }
                result[tag] = dvalue.default(customConfig, defaultConfig);
            }
        }
        return result;
    }
};

module.exports = ConfigReader;
