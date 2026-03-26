/**
 * Patches Payload v2 admin panel I18n component to handle async config loading.
 * Without this patch, the I18n component crashes with "Cannot read properties of undefined (reading 'config')"
 * because useConfig() returns undefined before the config promise resolves.
 *
 * This runs automatically after `npm install` via the postinstall script in package.json.
 */
const fs = require('fs');
const path = require('path');

const i18nPath = path.join(__dirname, 'node_modules/payload/dist/admin/components/utilities/I18n/index.js');

if (!fs.existsSync(i18nPath)) {
  console.log('[postinstall] Payload I18n file not found, skipping patch');
  process.exit(0);
}

let src = fs.readFileSync(i18nPath, 'utf8');

// Already patched
if (src.includes('if (!config || _i18next.default.isInitialized)')) {
  console.log('[postinstall] Payload I18n already patched');
  process.exit(0);
}

const oldFn = `const I18n = ()=>{
    const config = (0, _Config.useConfig)();
    if (_i18next.default.isInitialized) {
        return null;
    }
    _i18next.default.use(new _i18nextbrowserlanguagedetector.default(null, {
        lookupCookie: 'lng',
        lookupLocalStorage: 'lng'
    })).use(_reacti18next.initReactI18next).init((0, _deepmerge.default)(_defaultOptions.defaultOptions, config.i18n || {}));
    _react.loader.config({
        'vs/nls': {
            availableLanguages: {
                '*': (0, _getSupportedMonacoLocale.getSupportedMonacoLocale)(_i18next.default.language)
            }
        }
    });
    return null;
};`;

const newFn = `const I18n = ()=>{
    const config = (0, _Config.useConfig)();
    if (!config || _i18next.default.isInitialized) {
        return null;
    }
    _i18next.default.use(new _i18nextbrowserlanguagedetector.default(null, {
        lookupCookie: 'lng',
        lookupLocalStorage: 'lng'
    })).use(_reacti18next.initReactI18next).init((0, _deepmerge.default)(_defaultOptions.defaultOptions, config.i18n || {}));
    try {
        _react.loader.config({
            'vs/nls': {
                availableLanguages: {
                    '*': (0, _getSupportedMonacoLocale.getSupportedMonacoLocale)(_i18next.default.language)
                }
            }
        });
    } catch(e) {}
    return null;
};`;

if (src.includes(oldFn)) {
  src = src.replace(oldFn, newFn);
  fs.writeFileSync(i18nPath, src);
  console.log('[postinstall] Payload I18n patched successfully');
} else {
  console.log('[postinstall] Payload I18n patch target not found (may be a different version)');
}
