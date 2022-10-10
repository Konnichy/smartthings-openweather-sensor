const axios = require('axios').default;

const baseApiUrl = 'https://api.openweathermap.org/data/2.5';

module.exports = {
    getCurrent: async function (location, units, apiKey) {
        const url = `${baseApiUrl}/weather`;
        const config = {
            params: {
                q: location,
                units: units,
                appid: apiKey
            }
        };

        const response = await axios.get(url, config);
        return response.data;
    },
};
