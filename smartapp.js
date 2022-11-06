const SmartApp = require('@smartthings/smartapp');
const openweather = require('./openweather');

const DEVICE_PROFILE_ID = '8700c22c-f463-4d35-b0ea-c0dd7f43e9c2';

async function subscribeToPeriodicRefreshes(context) {
    const scheduleInterval = context.configStringValue('scheduleInterval');

    if (scheduleInterval === 'never')
        return;

    // Base the schedule period on the current time,
    // to avoid having all instances of this SmartApp
    // call the OpenWeather API at 0, 15, 30 and 45 minutes
    switch (scheduleInterval) {
        case "1":
            // every minute
            scheduledMinutes = "0/1";
            break;
        case "0":
            // once per hour
            currentMinute = new Date().getMinutes();
            scheduledMinutes = currentMinute;
            break;
        case "15":  // every 15 minutes
        case "30":  // every 30 minutes
            currentMinute = new Date().getMinutes();
            startMinute = currentMinute - (Math.trunc(currentMinute / scheduleInterval) * scheduleInterval);
            scheduledMinutes = startMinute + "/" + scheduleInterval;
    }

    const scheduleData = {
        'name': 'periodicRefreshEvent',
        'cron': {
            'expression': `${scheduledMinutes} * * * ? *`,
            'timezone': 'UTC'
        }
    };
    await context.api.schedules.create(scheduleData);
}

async function getDeviceId(context) {
    const devices = await context.api.devices.list({'installedAppId': context.installedAppId});
    return devices[0].deviceId;
}

async function updateDeviceData(context, deviceId, deviceData) {
    const units = context.configStringValue('units');

    var deviceEvents = [];
    Object.keys(deviceData).forEach(function(key) {
        if (key === 'temperature') {
            deviceEvents.push({
                component: 'main',
                capability: 'temperatureMeasurement',
                attribute: 'temperature',
                value: deviceData.temperature,
                unit: (units == 'imperial')?"F":"C"
            });
        } else if (key === 'humidity') {
            deviceEvents.push({
                component: 'main',
                capability: 'relativeHumidityMeasurement',
                attribute: 'humidity',
                value: deviceData.humidity,
                unit: "%"
            });
        }
    });

    await context.api.devices.createEvents(deviceId, deviceEvents);
}

async function refreshWeatherData(context, deviceId) {
    const location = context.configStringValue('location');
    const units = context.configStringValue('units');
    const apikey = context.event.settings.OPENWEATHER_API_KEY;

    console.log("Updating weather data...");

    const weatherData = await openweather.getCurrent(location, units, apikey);

    if (deviceId === undefined)
        deviceId = await getDeviceId(context);
    await updateDeviceData(context, deviceId, {
        'temperature': weatherData.main.temp,
        'humidity': weatherData.main.humidity
    });
}

async function periodicRefreshHandler(context, eventData) {
    console.log("Periodic weather data refresh...");

    await refreshWeatherData(context);
}

async function pushHandler(context, deviceId, command) {
    console.log("Forced weather data refresh...");

    await refreshWeatherData(context, deviceId);
}

module.exports = new SmartApp()
    .configureI18n()
    // .enableEventLogging(2) // logs all lifecycle event requests/responses as pretty-printed JSON. Omit in production
    .appId('OpenWeather sensor')
    .disableCustomDisplayName(true)
    // i:deviceprofiles to create devices
    // r:devices:* (or l:devices ?) to list devices
    // w:devices:* to create device events
    // w:schedules to create or delete schedules
    //   |-> this permission does not seem necessary,
    //       does not exist in the Developer Workspace,
    //       and crashes upon installing or updating if
    //       added here anyway.
    .permissions(['i:deviceprofiles:*', 'r:devices:*', 'w:devices:*'])
    .page('mainPage', (context, page, configData) => {
        page.section('mainSection', section => {
            section.textSetting('location')
                .required(true);
            section.enumSetting('units')
                .options([
                    { id: "metric",   name: "metric"   },
                    { id: "imperial", name: "imperial" }
                ])
                .required(true)
                .defaultValue("metric");
            section.enumSetting('scheduleInterval')
                .options([
                    { name: "never", id: "never" },
                    { name: "15min", id: "15"    },
                    { name: "30min", id: "30"    },
                    { name: "1h",    id: "0"     }
                ])
                .required(true)
                .defaultValue("15");
        });
    })
    .installed(async (context, installData) => {
        console.log("Installing the virtual device...");

        // Create the virtual device
        const deviceDefinition = {
            label: 'OpenWeather sensor',  // optional, the device takes the name of the profile if not provided
            // It is recommended to use a PUBLISHED device
            // profile. To do so, configure SmartThings CLI
            // and use `deviceprofiles:publish` interface.
            profileId: DEVICE_PROFILE_ID
        };
        const device = await context.api.devices.create(deviceDefinition);

        // Subscribe to periodic refreshes
        await subscribeToPeriodicRefreshes(context);

        // Set initial weather data
        await refreshWeatherData(context, device.deviceId);
    })
    .updated(async (context, updateData) => {
        console.log("Updating schedules...");

        // Update the subscription to periodic refreshes
        await context.api.schedules.delete();
        await subscribeToPeriodicRefreshes(context);

        // Update weather data
        await refreshWeatherData(context);
    })
    .scheduledEventHandler('periodicRefreshEvent', periodicRefreshHandler)
    .deviceCommand('main/momentary/push', pushHandler);
