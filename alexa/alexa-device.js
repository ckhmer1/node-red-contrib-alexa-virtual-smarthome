/**
 * NodeRED Alexa SmartHome
 * Copyright (C) 2021 Claudio Chimera.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 **/

// https://developer.amazon.com/en-US/docs/alexa/smarthome/understand-the-smart-home-skill-api.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/smart-home-general-apis.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-powercontroller.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-discovery.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
// https://developer.amazon.com/en-US/docs/alexa/smarthome/state-reporting-for-a-smart-home-skill.html
// https://developer.amazon.com/en-US/docs/alexa/smarthome/get-started-with-device-templates.html
// https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-property-schemas.html

const float_values = {
    color: {
        saturation: true,
        brightness: true
    }
};

module.exports = function (RED) {
    "use strict";

    const DEFAULT_PAYLOAD_VERSION = '3';
    const Formats = {
        BOOL: 1,
        INT: 2,
        FLOAT: 4,
        STRING: 8,
        OBJECT: 16,
        ARRAY: 32,
        MANDATORY: 128,
        COPY_OBJECT: 256,
    };

    const EXCLUSIVE_STATES = {
        color: ['colorTemperatureInKelvin'],
        colorTemperatureInKelvin: ['color'],
        lowerSetpoint: ['targetSetpoint'],
        upperSetpoint: ['targetSetpoint'],
        targetSetpoint: ['lowerSetpoint', 'upperSetpoint'],
    };


    /******************************************************************************************************************
     *
     *
     */
    class AlexaDeviceNode {
        constructor(config) {
            RED.nodes.createNode(this, config);
            var node = this;
            node.config = config;
            node.YES = RED._("alexa-device.label.YES");
            node.NO = RED._("alexa-device.label.NO");
            node.state = {};
            node.state_types = {};

            node.alexa = RED.nodes.getNode(node.config.alexa);

            if (!node.config.alexa) {
                node.error(RED._("alexa-device.error.missing-config"));
                node.status({ fill: "red", shape: "dot", text: RED._("alexa-device.error.missing-config") });
                return;
            } else if (typeof node.alexa.register !== 'function') {
                node.error(RED._("alexa-device.error.missing-bridge"));
                node.status({ fill: "red", shape: "dot", text: RED._("alexa-device.error.missing-bridge") });
                return;
            }
            if (node.isVerbose()) node._debug("config " + JSON.stringify(config));
            if (node.isVerbose()) node._debug("display_categories " + JSON.stringify(node.config.display_categories));
            let names = node.config.display_categories.map(dt => RED._("alexa-device.display_category." + dt));
            node.device_desc = names.join();

            node.setupCapabilities();
            node.alexa.register(node);

            node.on('input', function (msg) {
                node.onInput(msg);
            });

            node.on('close', function (removed, done) {
                if (node.isVerbose()) node._debug("(on-close) " + node.config.name);
                node.onClose(removed, done);
            });
            node.updateStatusIcon();
        }

        //
        //
        //
        //
        isVerbose() {
            return this.config.alexa && this.alexa.config.verbose;
        }

        //
        //
        //
        //
        _debug(msg) {
            console.log('AlexaDeviceNode:' + msg); // TODO REMOVE
            this.debug('AlexaDeviceNode:' + msg);
        }

        //
        //
        //
        //
        onClose(removed, done) {
            var node = this;
            node.alexa.deregister(node, removed);
            // TODO if removed, send remove event?

            if (typeof done === 'function') {
                done();
            }
        }

        //
        //
        //
        //
        onInput(msg) {
            var node = this;
            const topicArr = String(msg.topic || '').split('/');
            const topic = topicArr[topicArr.length - 1].toUpperCase();
            if (node.isVerbose()) node._debug("onInput " + topic);
            if (topic === 'REPORTSTATE') {
                node.alexa.send_change_report(node.id).then(() => { });
            } else if (topic === 'GETSTATE') {
                node.send({
                    topic: "getState",
                    payload: node.state
                })
                // node.sendState([], {}, undefined, "getState");
            } else if (topic === 'GETALLSTATES') {
                let states = node.alexa.get_all_states();
                node.send({
                    topic: "getAllStates",
                    payload: states
                })
            } else if (topic === 'GETNAMES') {
                let names = node.alexa.get_all_names();
                node.send({
                    topic: "getNames",
                    payload: names
                })
            } else if (topic === 'DOORBELLPRESS') {
                // TODO https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-doorbelleventsource.html
                // https://developer.amazon.com/en-US/docs/alexa/smarthome/state-reporting-for-a-smart-home-skill.html#cause-object
                // cause APP_INTERACTION PERIODIC_POLL PHYSICAL_INTERACTION RULE_TRIGGER VOICE_INTERACTION 
                // timestamp
                if (node.isVerbose()) node._debug("CCHI " + node.id + "  " + topicArr[topicArr.length - 1] + " " + msg.payload || '');
                process.nextTick(() => {
                    node.alexa.send_doorbell_press(node.id, msg.payload || '');
                });
            } else if (topic === 'CAMERASTREAMS') {
                node.cameraStreams = msg.payload;
                if (node.isVerbose()) node._debug("CCHI cameraStreams " + node.id + " " + JSON.stringify(node.cameraStreams));
            } else if (topic === 'SETMEDIA') {
                const media_to_set = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
                const media_id_to_set = media_to_set.map(m => m.id);
                const current_media_id = node.media.map(m => m.id);
                const media_id_to_remove = current_media_id.filter(id => !media_id_to_set.includes(id));
                node.media = media_to_set;
                const media_id_to_add = node.media.map(m => m.id);
                if (node.media) node.alexa.send_media_created_or_updated(node.id, node.media);
                if (media_id_to_remove.length > 0) node.alexa.send_media_deleted(node.id, media_id_to_remove);
            } else if (topic === 'ADDORUPDATEMEDIA') {
                const media_to_add = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
                const media_id_to_add = media_to_add.map(m => m.id);
                const existing_media_to_update = node.media.filter(m => media_id_to_add.includes(m.id));
                const existing_media_id_to_update = existing_media_to_update.map(m => m.id);
                node.media = node.media.filter(m => !existing_media_id_to_update.includes(m.id)); // Remove old media to update
                media_to_add.forEach(m => node.media.push(m));
                if (media_to_add) node.alexa.send_media_created_or_updated(node.id, media_to_add);
            } else if (topic === 'REMOVEMEDIA') {
                const media_id_to_remove = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
                const media_to_remove = node.media.filter(m => media_id_to_remove.includes(m.id));
                node.media = node.media.filter(m => !media_id_to_remove.includes(m.id));
                const media_id_removed = media_to_remove.map(m => m.id);
                if (media_id_removed.length > 0) node.alexa.send_media_deleted(node.id, media_id_removed);
            } else if (topic === 'SETSECURITYDEVICENAMESINERROR') {
                const topics = typeof msg.payload === 'string' ? [] : (Array.isArray(msg.payload || []) ? [] : msg.payload.topics);
                const names = typeof msg.payload === 'string' ? [msg.payload] : (Array.isArray(msg.payload || []) ? msg.payload || [] : msg.payload.names);
                node.security_device_names_in_error = [];
                for (const [id, name] of Object.entries(node.alexa.get_devices_id_name(names, topics))) {
                    node.security_device_names_in_error.push(name);
                }
                node._debug("CCHI " + node.id + " security_device_names_in_error " + JSON.stringify(node.security_device_names_in_error));
            } else if (topic === 'ADDSECURITYDEVICENAMESINERROR') {
                const a_topics = typeof msg.payload === 'string' ? [] : (Array.isArray(msg.payload || []) ? [] : msg.payload.topics);
                let a_names = typeof msg.payload === 'string' ? [msg.payload] : (Array.isArray(msg.payload || []) ? msg.payload || [] : msg.payload.names);
                node.security_device_names_in_error.forEach(name => a_names.push(name));
                node.security_device_names_in_error = [];
                for (const [id, name] of Object.entries(node.alexa.get_devices_id_name(a_names, a_topics))) {
                    node.security_device_names_in_error.push(name);
                }
                node._debug("CCHI " + node.id + " security_device_names_in_error " + JSON.stringify(node.security_device_names_in_error));
            } else if (topic === 'DELSECURITYDEVICENAMESINERROR') {
                const r_topics = typeof msg.payload === 'string' ? [] : (Array.isArray(msg.payload || []) ? [] : msg.payload.topics);
                let r_names = typeof msg.payload === 'string' ? [msg.payload] : (Array.isArray(msg.payload || []) ? msg.payload || [] : msg.payload.names);
                for (const [id, name] of Object.entries(node.alexa.get_devices_id_name(r_names, r_topics))) {
                    node.security_device_names_in_error = node.security_device_names_in_error.filter(i_name => i_name != name);
                }
                node._debug("CCHI2 " + node.id + " security_device_names_in_error " + JSON.stringify(node.security_device_names_in_error));
            } else if (topic === 'MEASUREMENTSREPORT') {
                let other_data = {};
                if (msg.correlationToken) {
                    other_data['event'] = {
                        header: {
                            correlationToken: msg.correlationToken
                        }
                    }
                };
                node.alexa.send_event_gw(node.id, 'Alexa.DeviceUsage.Meter', 'MeasurementsReport', msg.payload, other_data).then(() => { });
            } else if (topic === 'EXECDIRECTIVE') { // test
                if (node.isVerbose()) {
                    node._debug(" CCHI execDirective " + msg.namespace + " " + msg.name + " " + JSON.stringify(msg.payload));
                    let event_payload = {};
                    let modified = node.execDirective(msg, msg.payload, event_payload)
                    node._debug("CCHI modified " + node.id + " modified " + JSON.stringify(modified));
                    node._debug("CCHI event_payload " + node.id + " event_payload " + JSON.stringify(event_payload));
                }
            } else {
                if (node.isVerbose()) node._debug("CCHI Before " + node.id + " state " + JSON.stringify(node.state));
                const modified = node.setValues(msg.payload || {}, node.state);
                if (node.isVerbose()) node._debug("CCHI " + node.id + " modified " + JSON.stringify(modified));
                if (node.isVerbose()) node._debug("CCHI After " + node.id + " state " + JSON.stringify(node.state));
                if (modified.length > 0) {
                    process.nextTick(() => {
                        node.alexa.send_change_report(node.id, modified).then(() => { });
                    });
                }
                // node.sendState(modified, msg.payload);
            }
        }

        setupCapabilities() {
            var node = this;
            let state_types = node.state_types;
            node.capabilities = [];
            node.endpoint = node.getEndpoint();

            // https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html

            // AutomationManagement
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-automationmanagement.html

            // BrightnessController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-brightnesscontroller.html
            if (node.config.i_brightness_controller) {
                if (node.isVerbose()) node._debug("Alexa.BrightnessController");
                node.addCapability("Alexa.BrightnessController", {
                    brightness: 50
                });
                state_types['brightness'] = {
                    type: Formats.INT,
                    nin: 0,
                    max: 100
                };
            }
            // CameraStreamController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-camerastreamcontroller.html
            if (node.config.i_camera_stream_controller) {
                if (node.isVerbose()) node._debug("Alexa.CameraStreamController");
                node.cameraStreams = [];
                let camera_stream_configurations = [];
                node.config.camera_stream_configurations.forEach(c => {
                    let r = [];
                    c.r.forEach(wh => {
                        r.push({
                            width: wh[0],
                            height: wh[1]
                        });
                    });
                    camera_stream_configurations.push({
                        protocols: c.p,
                        resolutions: r,
                        authorizationTypes: c.t,
                        videoCodecs: c.v,
                        audioCodecs: c.a
                    });
                });
                node.addCapability("Alexa.CameraStreamController", undefined,
                    {
                        cameraStreamConfigurations: camera_stream_configurations
                    });
            }

            // ChannelController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-channelcontroller.html
            if (node.config.i_channel_controller) {
                if (node.isVerbose()) node._debug("Alexa.ChannelController");
                node.addCapability("Alexa.ChannelController", {
                    channel: {
                        number: "",
                        callSign: "",
                        affiliateCallSign: ""
                    }
                });
                // TODO one of channel or channelMetadata must be filled
                state_types['channel'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        number: {
                            type: Formats.INT,
                            min: 0
                        },
                        callSign: Formats.STRING,
                        affiliateCallSign: Formats.STRING,
                        uri: Formats.STRING,
                    },
                };
                state_types['channelMetadata'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        name: Formats.STRING,
                        image: Formats.STRING,
                    }
                };
            }
            // ColorController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-colorcontroller.html
            if (node.config.i_color_controller) {
                if (node.isVerbose()) node._debug("Alexa.ColorController");
                node.addCapability("Alexa.ColorController", {
                    color: {
                        hue: 350.5,
                        saturation: 0.7138,
                        brightness: 0.6524
                    }
                });
                state_types['color'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        hue: {
                            type: Formats.FLOAT,
                            min: 0,
                            max: 360
                        },
                        saturation: {
                            type: Formats.FLOAT,
                            min: 0,
                            max: 1
                        },
                        brightness: {
                            type: Formats.FLOAT,
                            min: 0,
                            max: 1
                        },
                    }
                };
            }

            // ColorTemperatureController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-colortemperaturecontroller.html
            if (node.config.i_color_temperature_controller) {
                if (node.isVerbose()) node._debug("Alexa.ColorTemperatureController");
                node.addCapability("Alexa.ColorTemperatureController", {
                    colorTemperatureInKelvin: 5500
                });
                state_types['colorTemperatureInKelvin'] = {
                    type: Formats.INT,
                    nin: 1000,
                    max: 10000
                };
            }

            // ContactSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-contactsensor.html
            if (node.config.i_contact_sensor) {
                if (node.isVerbose()) node._debug("Alexa.ContactSensor");
                node.addCapability("Alexa.ContactSensor", {
                    detectionState: 'NOT_DETECTED'
                });
                state_types['contactDetectionState'] = {
                    type: Formats.STRING + Formats.MANDATORY,
                    values: ['NOT_DETECTED', 'DETECTED'],
                };
            }

            // Device Usage Estimation
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-deviceusage-estimation.html
            if (node.config.i_device_usage_estimation) {
                if (node.isVerbose()) node._debug("Alexa.DeviceUsage.Estimation");
                let powerProfile = {};
                if (node.config.i_color_controller || node.config.i_color_temperature_controller) {
                    powerProfile['type'] = 'BRIGHTNESS_COLOR';
                } else if (node.config.i_brightness_controller) {
                    powerProfile['type'] = 'BRIGHTNESS';
                } else if (node.config.i_power_controller) {
                    powerProfile['type'] = 'POWER';
                }
                if (powerProfile['type']) {
                    powerProfile['standbyWattage'] = {
                        "value": this.to_float(node.config.standby_wattage, .1),
                        "units": "WATTS"
                    };
                    if (powerProfile['type'] === 'POWER') {
                        powerProfile['onWattage'] = {
                            "value": this.to_float(node.config.maximum_wattage, 10),
                            "units": "WATTS"
                        };
                    } else {
                        powerProfile['maximumWattage'] = {
                            "value": this.to_float(node.config.maximum_wattage, 9),
                            "units": "WATTS"
                        };
                    }
                    node.addCapability("Alexa.DeviceUsage.Estimation", undefined,
                        {
                            configurations: {
                                powerProfile: powerProfile
                            }
                        });
                }
            }

            // Device Usage Meter
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-deviceusage-meter.html
            if (node.config.i_device_usage_meter) {
                if (node.isVerbose()) node._debug("Alexa.DeviceUsage.Meter");
                let energy_sources = {};
                let add_interface = false;
                if (node.config.electricity_measuring_method && node.config.electricity_unit) {
                    add_interface = true;
                    energy_sources['electricity'] = {
                        unit: node.config.electricity_measuring_method,
                        measuringMethod: node.config.electricity_unit,
                        defaultResolution: parseInt(node.config.electricity_default_resolution) || 3600
                    };
                }
                if (node.config.natural_gas_measuring_method && node.config.natural_gas_unit) {
                    add_interface = true;
                    energy_sources['naturalGas'] = {
                        unit: node.config.natural_gas_measuring_method,
                        measuringMethod: node.config.natural_gas_unit,
                        defaultResolution: parseInt(node.config.natural_gas_default_resolution) || 3600
                    };
                }
                if (add_interface) {
                    node.addCapability("Alexa.DeviceUsage.Meter", undefined, {
                        configurations: {
                            energySources: energy_sources
                        }
                    });
                }
            }

            // Doorbell Event Source
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-doorbelleventsource.html
            if (node.config.i_doorbell_event_source) {
                if (node.isVerbose()) node._debug("Alexa.DoorbellEventSource");
                let capability = node.addCapability("Alexa.DoorbellEventSource");
                capability['proactivelyReported'] = true;
            }

            // EndpointHealth
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-endpointhealth.html
            if (node.config.i_endpoint_health) {
                if (node.isVerbose()) node._debug("Alexa.EndpointHealth");
                node.addCapability("Alexa.EndpointHealth", {
                    connectivity: {
                        value: "OK"
                    } // UNREACHABLE
                });
                // TODO battery, radioDiagnostics, networkThroughput
                state_types['connectivity'] = {
                    type: Formats.OBJECT + Formats.MANDATORY,
                    attributes: {
                        value: {
                            type: Formats.STRING + Formats.MANDATORY,
                            values: ['OK', 'UNREACHABLE'],
                        },
                        reason: {
                            type: Formats.STRING,
                            values: ['WIFI_BAD_PASSWORD',
                                'WIFI_AP_NOT_FOUND',
                                'WIFI_ROUTER_UNREACHABLE',
                                'WIFI_AP_CHANNEL_QUALITY_LOW',
                                'INTERNET_UNREACHABLE',
                                'CAPTIVE_PORTAL_CHECK_FAILED',
                                'UNKNOWN'
                            ],
                        }
                    }
                };
                state_types['battery '] = {
                    type: Formats.OBJECT,
                    attributes: {
                        health: {
                            type: Formats.OBJECT + Formats.MANDATORY,
                            attributes: {
                                state: {
                                    type: Formats.STRING,
                                    values: ['OK', 'WARNING', 'CRITICAL'],
                                },
                                reasons: {
                                    type: Formats.STRING + Formats.ARRAY,
                                    values: [
                                        'COLD',
                                        'DEAD',
                                        'OVERHEATED',
                                        'OVER_VOLTAGE',
                                        'NO_BATTERY',
                                        'LOW_CHARGE',
                                        'UNKNOWN'
                                    ]
                                }
                            }
                        },
                        chargingHealth: {
                            type: Formats.OBJECT,
                            attributes: {
                                state: {
                                    type: Formats.STRING,
                                    values: ['OK', 'WARNING', 'CRITICAL'],
                                },
                                reasons: {
                                    type: Formats.STRING + Formats.ARRAY,
                                    values: [
                                        'LOW_POWER',
                                        'INCOMPATIBLE_CHARGER',
                                        'UNKNOWN'
                                    ],
                                }
                            }
                        },
                        levelPercentage: {
                            type: Formats.INT,
                            min: 0,
                            max: 100
                        }
                    }
                };
                state_types['radioDiagnostics '] = {
                    type: Formats.OBJECT,
                    attributes: {
                        radioType: {
                            type: Formats.STRING,
                            values: ['WIFI', 'BLUETOOTH'],
                        },
                        signalStrength: {
                            type: Formats.OBJECT,
                            attributes: {
                                quality: {
                                    type: Formats.STRING,
                                    values: ['GOOD', 'FAIR', 'POOR']
                                },
                                rssiInDBM: {
                                    type: Formats.INT,
                                    min: -1000,
                                    max: 1000,
                                }
                            }
                        },
                        signalToNoiseRatio: {
                            type: Formats.OBJECT,
                            attributes: {
                                quality: {
                                    type: Formats.STRING,
                                    values: ['GOOD', 'FAIR', 'POOR']
                                },
                                snrInDB: {
                                    type: Formats.INT,
                                    min: 0,
                                    max: 1000,
                                }
                            }
                        }
                    }
                };
                state_types['radioDiagnostics'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        quality: {
                            type: Formats.STRING,
                            values: ['GOOD', 'FAIR', 'POOR']
                        },
                        rssiInDBM: {
                            type: Formats.INT,
                            min: -1000,
                            max: 1000,
                        }
                    }
                }
                state_types['signalToNoiseRatio'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        quality: {
                            type: Formats.STRING,
                            values: ['GOOD', 'FAIR', 'POOR']
                        },
                        snrInDB: {
                            type: Formats.INT,
                            min: 0,
                            max: 1000,
                        }
                    }
                };
                state_types['networkThroughput '] = {
                    type: Formats.OBJECT,
                    attributes: {
                        quality: {
                            type: Formats.STRING,
                            values: ['GOOD', 'FAIR', 'POOR']
                        },
                        bitsPerSecond: {
                            type: Formats.INT,
                            min: 0,
                        }
                    }
                };
            }

            // EqualizerController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-equalizercontroller.html
            if (node.config.i_equalizer_controller) {
                if (node.isVerbose()) node._debug("Alexa.EqualizerController");
                let properties = {};
                let configurations = {};
                if (node.config.bands.length > 0) {
                    let bands_supported = [];
                    let bands_value = [];
                    let attributes = [];
                    node.config.bands.forEach(band => {
                        bands_supported.push({
                            name: band
                        });
                        bands_value.push({
                            name: band,
                            value: 0
                        });
                        attributes[band] = {
                            type: Formats.INT + Formats.MANDATORY,
                            min: node.to_int(node.config.band_range_min, 0),
                            max: node.to_int(node.config.band_range_max, 10),
                        };
                    });
                    properties['bands'] = bands_value;
                    configurations['bands'] = {
                        supported: bands_supported,
                        range: {
                            minimum: node.to_int(node.config.band_range_min, -6),
                            maximum: node.to_int(node.config.band_range_max, 6)
                        }
                    }
                    state_types['bands'] = {
                        type: Formats.OBJECT,
                        attributes: attributes,
                    };
                }
                if (node.config.modes.length > 0) {
                    properties['mode'] = node.config.modes[0];
                    let modes_supported = [];
                    node.config.modes.forEach(mode => {
                        modes_supported.push({
                            name: mode
                        });
                    });
                    configurations['modes'] = {
                        supported: modes_supported
                    }
                    state_types['mode'] = {
                        type: Formats.STRING,
                        values: node.config.modes
                    };
                }
                node.addCapability("Alexa.EqualizerController", properties,
                    {
                        configurations: configurations
                    });
            }

            // EventDetectionSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-eventdetectionsensor.html
            if (node.config.i_event_detection_sensor) {
                if (node.isVerbose()) node._debug("Alexa.EventDetectionSensor");
                node.addCapability("Alexa.EventDetectionSensor", {
                    humanPresenceDetectionState: {
                        value: 'NOT_DETECTED'
                    } // DETECTED
                    // TODO detectionMethods, media: { "type": "ALEXA.MEDIAMETADATA", "id": "<media metadata id>" }
                },
                    {
                        configuration: {
                            detectionMethods: [
                                "AUDIO",
                                "VIDEO"
                            ],
                            detectionModes: {
                                humanPresence: {
                                    featureAvailability: "ENABLED",
                                    supportsNotDetected: true
                                }
                            }
                        }
                    });
                state_types['humanPresenceDetectionState'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        value: {
                            type: Formats.STRING,
                            values: ['DETECTED', 'NOT_DETECTED'],
                        },
                        detectionMethods: {
                            type: Formats.STRING + Formats.ARRAY,
                            values: ['AUDIO', 'VIDEO'],
                        },
                        media: {
                            type: Formats.OBJECT,
                            attributes: {
                                type: {
                                    type: Formats.STRING,
                                    values: ['ALEXA.MEDIAMETADATA']
                                },
                                id: {
                                    type: Formats.STRING,
                                    // TODO is_valid: a valid media id
                                }
                            }

                        },
                    }
                };
            }

            // InputController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-inputcontroller.html
            if (node.config.i_input_controller) {
                if (node.isVerbose()) node._debug("Alexa.InputController");
                let inputs = [];
                node.config.a_inputs.forEach(input => {
                    inputs.push({
                        name: input
                    })
                })
                node.addCapability("Alexa.InputController",
                    {
                        input: ''
                    },
                    {
                        inputs: inputs
                    }
                );
                state_types['input'] = {
                    type: Formats.STRING,
                    value: node.config.a_inputs,
                };
            }
            // InventoryLevelSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-inventorylevelsensor.html

            // InventoryUsageSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-inventoryusagesensor.html

            // KeypadController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-keypadcontroller.html
            if (node.config.i_keypad_controller) {
                if (node.isVerbose()) node._debug("Alexa.KeypadController");
                node.addCapability("Alexa.KeypadController", {}, {
                    keys: node.config.a_kc_keys
                });
            }

            // LockController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-lockcontroller.html
            if (node.config.i_lock_controller) {
                if (node.isVerbose()) node._debug("Alexa.LockController");
                node.addCapability("Alexa.LockController", {
                    lockState: 'LOCKED' // UNLOCKED JAMMED
                });
                state_types['lockState'] = {
                    type: Formats.STRING,
                    lockState: ['LOCKED', 'UNLOCKED', 'JAMMED'],
                };
            }

            // MediaMetadata
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-mediametadata.html
            if (node.config.i_media_metadata) {
                if (node.isVerbose()) node._debug("Alexa.MediaMetadata");
                node.media = [];
                node.addCapability("Alexa.MediaMetadata");
            }

            // ModeController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-modecontroller.html

            // MotionSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-motionsensor.html
            if (node.config.i_motion_sensor) {
                if (node.isVerbose()) node._debug("Alexa.MotionSensor");
                node.addCapability("Alexa.MotionSensor", {
                    detectionState: 'NOT_DETECTED' // DETECTED
                });
                state_types['motionDetectionState'] = {
                    type: Formats.STRING,
                    values: ['DETECTED', 'NOT_DETECTED'],
                };
            }

            // PercentageController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-percentagecontroller.html
            if (node.config.i_percentage_controller) {
                if (node.isVerbose()) node._debug("Alexa.PercentageController");
                node.addCapability("Alexa.PercentageController", {
                    percentage: 0
                });
                state_types['percentage'] = {
                    type: Formats.INT,
                    min: 0,
                    max: 100,
                };
            }

            // PlaybackController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-playbackcontroller.html
            if (node.config.i_playback_controller) {
                if (node.isVerbose()) node._debug("Alexa.PlaybackController");
                node.addCapability("Alexa.PlaybackController", undefined, {
                    supportedOperations: node.config.a_playback_modes
                });
            }

            // PowerController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-powercontroller.html
            if (node.config.i_power_controller) {
                if (node.isVerbose()) node._debug("Alexa.PowerController");
                node.addCapability("Alexa.PowerController", {
                    powerState: 'OFF'
                });
                state_types['powerState'] = {
                    type: Formats.STRING,
                    lockState: ['ON', 'OFF'],
                };
            }

            // PowerLevelController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-powerlevelcontroller.html
            if (node.config.i_power_level_controller) {
                if (node.isVerbose()) node._debug("Alexa.PowerLevelController");
                node.addCapability("Alexa.PowerLevelController", {
                    powerLevel: 50
                });
                state_types['powerLevel'] = {
                    type: Formats.INT,
                    min: 0,
                    max: 100,
                };
            }

            // RangeController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-rangecontroller.html

            // RTCSessionController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-rtcsessioncontroller.html

            // SceneController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-scenecontroller.html
            if (node.config.i_scene_controller) {
                if (node.isVerbose()) node._debug("Alexa.SceneController");
                node.addCapability("Alexa.SceneController", undefined, {
                    supportsDeactivation: true
                });
            }

            // SecurityPanelController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-securitypanelcontroller.html
            if (node.config.i_security_panel_controller) {
                if (node.isVerbose()) node._debug("Alexa.SecurityPanelController");
                node.security_device_names_in_error = [];
                const arm_state = node.config.arm_state || [];
                const alarms = node.config.alarms || [];
                const pin_code = node.config.pin_code || '';
                let configuration = {};
                if (arm_state.length > 0 || pin_code.trim().length === 4) {
                    let properties_value = {};
                    if (arm_state.length > 0) {
                        properties_value['armState'] = arm_state.includes('DISARMED') ? 'DISARMED' : arm_state[0];
                        configuration['supportedArmStates'] = arm_state.map(state => ({ "value": state }));
                    }
                    state_types['armState'] = {
                        type: Formats.STRING,
                        values: ['DISARMED', 'ARMED_AWAY', 'ARMED_STAY', 'ARMED_NIGHT'],
                    };
                    alarms.forEach(alarm => {
                        properties_value[alarm] = {
                            value: "OK"
                        };
                        state_types[alarm] = {
                            type: Formats.OBJECT,
                            attributes: {
                                value: {
                                    type: Formats.STRING,
                                    values: ['OK', 'ALARM'],
                                }
                            }
                        };
                    });
                    if (pin_code.trim().length === 4) {
                        configuration['supportedAuthorizationTypes'] = [{ type: 'FOUR_DIGIT_PIN' }];
                    }
                    node.addCapability("Alexa.SecurityPanelController", properties_value,
                        {
                            configuration: configuration
                        }
                    );
                }
            }

            // Speaker
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-speaker.html
            if (node.config.i_speaker) {
                if (node.isVerbose()) node._debug("Alexa.Speaker");
                node.addCapability("Alexa.Speaker", {
                    volume: 50,
                    muted: false
                });
                state_types['volume'] = {
                    type: Formats.INT,
                    min: 0,
                    max: 100,
                };
                state_types['muted'] = {
                    type: Formats.BOOL,
                };
            }

            // StepSpeaker
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-stepspeaker.html
            if (node.config.i_step_speaker) {
                if (node.isVerbose()) node._debug("Alexa.StepSpeaker");
                node.addCapability("Alexa.StepSpeaker");
            }

            // TemperatureSensor
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-temperaturesensor.html
            if (node.config.i_temperature_sensor) {
                if (node.isVerbose()) node._debug("Alexa.TemperatureSensor");
                node.addCapability("Alexa.TemperatureSensor", {
                    temperature: {
                        value: 19.9,
                        scale: "CELSIUS" // FAHRENHEIT KELVIN
                    }
                });
                state_types['temperature'] = {
                    type: Formats.OBJECT,
                    attributes: {
                        value: {
                            type: Formats.FLOAT,
                        },
                        scale: {
                            type: Formats.STRING,
                            values: ['CELSIUS', 'FAHRENHEIT', 'KELVIN'],
                        }
                    }
                };
            }

            // ThermostatController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-thermostatcontroller.html
            if (node.config.i_thermostat_controller) {
                if (node.isVerbose()) node._debug("Alexa.ThermostatController");
                let properties = {};
                if (node.config.a_target_setpoint) {
                    properties.targetSetpoint = {
                        value: 20.1,
                        scale: "CELSIUS"
                    };
                    state_types['targetSetpoint'] = {
                        type: Formats.OBJECT,
                        attributes: {
                            value: {
                                type: Formats.FLOAT,
                            },
                            scale: {
                                type: Formats.STRING,
                                values: ['CELSIUS', 'FAHRENHEIT', 'KELVIN'],
                            }
                        }
                    };
                }
                if (node.config.a_lower_setpoint) {
                    properties.lowerSetpoint = {
                        value: 20.1,
                        scale: "CELSIUS"
                    };
                    state_types['lowerSetpoint'] = {
                        type: Formats.OBJECT,
                        attributes: {
                            value: {
                                type: Formats.FLOAT,
                            },
                            scale: {
                                type: Formats.STRING,
                                values: ['CELSIUS', 'FAHRENHEIT', 'KELVIN'],
                            }
                        }
                    };
                }
                if (node.config.a_upper_setpoint) {
                    properties.upperSetpoint = {
                        value: 20.1,
                        scale: "CELSIUS"
                    };
                    state_types['upperSetpoint'] = {
                        type: Formats.OBJECT,
                        attributes: {
                            value: {
                                type: Formats.FLOAT,
                            },
                            scale: {
                                type: Formats.STRING,
                                values: ['CELSIUS', 'FAHRENHEIT', 'KELVIN'],
                            }
                        }
                    };
                    // TODO exclusive attributes
                }
                if (node.config.a_modes.length > 1) {
                    properties.thermostatMode = node.config.a_modes.includes('OFF') ? 'OFF' : node.config.a_modes[0];
                    state_types['thermostatMode'] = {
                        type: Formats.OBJECT,
                        values: node.config.a_modes,
                    };
                }
                node.addCapability("Alexa.ThermostatController",
                    properties,
                    {
                        configuration: {
                            supportedModes: node.config.a_modes,
                            supportsScheduling: node.config.a_supports_scheduling
                        }
                    }
                );
                /*delete node.state.thermostat_mode;
                node.state['schedule'] = {
                    start: "",
                    duration: ""
                };*/
            }

            // ThermostatController.HVAC.Components
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-thermostatcontroller-hvac-components.html
            if (node.config.i_thermostat_controller_hvac_components) {
                if (node.isVerbose()) node._debug("Alexa.ThermostatController.HVAC.Components");
                let properties = {};
                let configurations = {};
                let add_interface = false;
                if (node.config.primary_heater_operation) {
                    properties['primaryHeaterOperation'] = 'OFF';
                    configurations['numberOfPrimaryHeaterOperations'] = parseInt(node.config.primary_heater_operation.substr(node.config.primary_heater_operation.length - 1));
                    add_interface = true;
                    state_types['primaryHeaterOperation'] = {
                        type: Formats.STRING,
                        values: ['OFF', 'STAGE_1', 'STAGE_2', 'STAGE_3'].slice(0, 1 + configurations['numberOfPrimaryHeaterOperations']),
                    };
                }
                if (node.config.auxiliary_heater_operation) {
                    properties['auxiliaryHeaterOperation'] = 'OFF';
                    add_interface = true;
                    state_types['auxiliaryHeaterOperation'] = {
                        type: Formats.STRING,
                        values: ['ON', 'OFF'],
                    };
                }
                if (node.config.cooler_operation) {
                    properties['coolerOperation'] = 'OFF';
                    configurations['numberOfCoolerOperations'] = parseInt(node.config.cooler_operation.substr(node.config.cooler_operation.length - 1));
                    add_interface = true;
                    state_types['coolerOperation'] = {
                        type: Formats.STRING,
                        values: ['OFF', 'STAGE_1', 'STAGE_2', 'STAGE_3'].slice(0, 1 + configurations['numberOfCoolerOperations']),
                    };
                }
                if (node.config.fan_operation) {
                    properties['fanOperation'] = 'OFF';
                    configurations['numberOfFanOperations'] = parseInt(node.config.fan_operation.substr(node.config.fan_operation.length - 1));
                    add_interface = true;
                    state_types['fanOperation'] = {
                        type: Formats.STRING,
                        values: ['OFF', 'STAGE_1', 'STAGE_2', 'STAGE_3'].slice(0, 1 + configurations['numberOfFanOperations']),
                    };
                }
                if (add_interface) {
                    node.addCapability("ThermostatController.HVAC.Components", properties, {
                        configuration: configurations
                    });
                }
            }

            // ToggleController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-togglecontroller.html

            // WakeOnLANController
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-wakeonlancontroller.html
            if (node.config.i_wake_on_lan_controller) {
                if (node.isVerbose()) node._debug("Alexa.WakeOnLANController");
                if (node.config.mac_addresses.length > 0) {
                    node.addCapability("Alexa.WakeOnLANController", undefined, {
                        configuration: {
                            mac_addresses: node.config.mac_addresses
                        }
                    });
                }
            }

            if (node.isVerbose()) node._debug("name " + JSON.stringify(node.name));
            if (node.isVerbose()) node._debug("capabilities " + JSON.stringify(node.capabilities));
            if (node.isVerbose()) node._debug("properties " + JSON.stringify(node.getProperties()));
            if (node.isVerbose()) node._debug("states " + JSON.stringify(node.state));
            if (node.isVerbose()) node._debug("state_types " + JSON.stringify(node.state_types));
        }

        getEndpoint() {
            var node = this;
            let endpoint = {
                "endpointId": node.config.id,
                "manufacturerName": "Node-RED",
                "description": node.device_desc + " " + node.config.name + " by Node-RED",
                "friendlyName": node.config.name,
                "displayCategories": node.config.display_categories,
                "additionalAttributes": {
                    "manufacturer": "Node-RED",
                    "model": node.device_desc,
                },
                "capabilities": node.capabilities,
                "connections": [],
                "relationships": {},
                "cookie": {}
            };
            return endpoint;
        }

        //
        //
        //
        //
        getCapability(iface, properties_val) {
            var node = this;
            let capability = {
                type: "AlexaInterface",
                interface: iface,
                version: DEFAULT_PAYLOAD_VERSION,
            };
            if (properties_val) {
                let supported = [];
                Object.keys(properties_val).forEach(key => {
                    const mapped_key = node.alexa.get_mapped_property(iface, key);
                    node.state[mapped_key] = properties_val[key];
                    supported.push({
                        name: key
                    });
                });
                capability['properties'] = {
                    supported: supported,
                    proactivelyReported: true,
                    retrievable: true,
                    nonControllable: false
                };
            }
            return capability;
        }

        //
        //
        //
        //
        addCapability(iface, properties_val, attributes) {
            var node = this;
            let capability = node.getCapability(iface, properties_val);
            if (attributes !== undefined) {
                Object.assign(capability, attributes);
            }
            node.capabilities.push(capability);
            return capability;
        }

        //
        //
        //
        //
        // https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
        execDirective(header, payload, cmd_res) { // Directive
            var node = this;
            const namespace = header['namespace']
            const name = header['name']
            if (node.isVerbose()) node._debug("execDirective state before " + name + "/" + namespace + " " + JSON.stringify(node.state));
            let modified = undefined;
            let send_state_in_out = true;
            let event_payload = {};
            let res_payload = {};
            let other_data = {};
            cmd_res['event'] = {
                payload: event_payload
            }
            cmd_res['payload'] = res_payload;
            cmd_res['name'] = 'Response';
            cmd_res['namespace'] = 'Alexa';

            switch (namespace) {
                case "Alexa.BrightnessController": // BrightnessController
                    if (name === 'SetBrightness') {
                        modified = node.setValues(payload, node.state);
                    } else if (name === 'AdjustBrightness') {
                        const modified = node.setValues({
                            brightness: node.state['brightness'] + payload.brightnessDelta
                        }, node.state);
                    }
                    break;

                case "Alexa.CameraStreamController": // CameraStreamController
                    if (name === 'InitializeCameraStreams') {
                        modified = [];
                        cmd_res['namespace'] = namespace;
                        const cameraStreams = payload.cameraStreams;
                        if (node.isVerbose()) node._debug("CCHI cameraStreams " + node.id + " " + JSON.stringify(node.cameraStreams));
                        if (node.isVerbose()) node._debug("CCHI payload " + node.id + " " + JSON.stringify(payload));
                        let css = [];
                        if (node.cameraStreams && node.cameraStreams.cameraStreams && node.cameraStreams.cameraStreams.length > 0) {
                            node.cameraStreams.cameraStreams.forEach(acs => {
                                cameraStreams.forEach(rcs => {
                                    if (acs.protocol === rcs.protocol &&
                                        acs.resolution.width === rcs.resolution.width &&
                                        acs.resolution.height === rcs.resolution.height &&
                                        acs.authorizationType === rcs.authorizationType &&
                                        acs.videoCodec === rcs.videoCodec &&
                                        acs.audioCodec === rcs.audioCodec
                                    ) {
                                        css.push({
                                            uri: acs.uri,
                                            expirationTime: acs.expirationTime,
                                            idleTimeoutSeconds: acs.idleTimeoutSeconds,
                                            protocol: acs.protocol,
                                            resolution: {
                                                width: acs.resolution.width,
                                                height: acs.resolution.height,
                                            },
                                            authorizationType: acs.authorizationType,
                                            videoCodec: acs.videoCodec,
                                            audioCodec: acs.audioCodec
                                        });
                                    }
                                });
                            });
                            if (css.length > 0) {
                                event_payload.cameraStreams = css;
                                event_payload.imageUri = node.cameraStreams.imageUri || '';
                            }
                        }
                    }
                case "Alexa.ChannelController": // ChannelController
                    if (name === 'ChangeChannel') {
                        modified = node.setValues(payload, node.state);
                    }
                    else if (name === 'SkipChannels') {
                        const channelCount = payload.channelCount;
                        // TODO, search current channel, increase by channelCount, set it
                        const new_channel = {
                            number: "7",
                            callSign: "CBS",
                            affiliateCallSign: "KIRO"
                        };
                        modified = [];
                    }
                    break;

                case "Alexa.ColorController": // ColorController
                    if (name === 'SetColor') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.ColorTemperatureController": // ColorTemperatureController
                    if (name === 'SetColorTemperature') {
                        modified = node.setValues(payload, node.state);
                    }
                    else if (name === 'IncreaseColorTemperature') {
                        modified = node.setValues({
                            brightness: node.state['colorTemperatureInKelvin'] + 100
                        }, node.state);
                    }
                    else if (name === 'DecreaseColorTemperature') {
                        modified = node.setValues({
                            brightness: node.state['colorTemperatureInKelvin'] - 100
                        }, node.state);
                    }
                    break;
                case "Alexa.DeviceUsage.Meter": // DeviceUsage.Meter
                    if (name === 'ReportMeasurements') {
                        modified = [];
                        other_data['correlationToken'] = header['correlationToken'];
                    } else if (name === 'ReduceResolution') {
                        modified = [];
                        other_data['correlationToken'] = header['correlationToken'];
                    } else if (name === 'InvalidMeasurementError') {
                        modified = [];
                        other_data['correlationToken'] = header['correlationToken'];
                    }
                    break;

                case "Alexa.EqualizerController": // EqualizerController
                    if (name === 'SetMode') {
                        modified = node.setValues(payload, node.state);
                    } else if (name === 'SetBands') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.MediaMetadata": // MediaMetadata
                    if (name === 'GetMediaMetadata') {
                        cmd_res['namespace'] = namespace;
                        cmd_res['name'] = name + '.Response';
                        if (node.isVerbose()) node._debug("execDirective node.media " + name + "/" + namespace + " " + JSON.stringify(node.media));
                        modified = []; // TODO
                        if (payload.filters && Array.isArray(payload.filters.mediaIds)) {
                            event_payload.media = [];
                            node.media.forEach(m => {
                                if (payload.filters.mediaIds.includes(m.id)) {
                                    event_payload.media.push(m);
                                }
                            });
                            const current_media_id = node.media.map(m => m.id);
                            event_payload.errors = [];
                            payload.filters.mediaIds.forEach(id => {
                                if (!current_media_id.includes(id)) {
                                    event_payload.errors.push({
                                        mediaId: id,
                                        status: "NOT_FOUND"
                                    });
                                }
                            });
                        } else {
                            event_payload.media = node.media;
                        }
                    }
                    break;

                case "Alexa.InputController": // InputController
                    if (name === 'SelectInput') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.KeypadController": // KeypadController
                    if (name === 'SendKeystroke') {
                        modified = [];
                    }
                    break;

                case "Alexa.LockController": // LockController
                    // TODO DeferredResponse
                    // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-response.html#deferred
                    if (name === 'Lock') {
                        modified = node.setValues({
                            lockState: 'LOCKED'
                        }, node.state);
                    }
                    else if (name === 'Unlock') {
                        modified = node.setValues({
                            lockState: 'UNLOCKED'
                        }, node.state);
                    }
                    break;

                case "Alexa.PercentageController": // PercentageController
                    if (name === 'SetPercentage') {
                        modified = node.setValues(payload, node.state);
                    } else if (name === 'AdjustPercentage') {
                        modified = node.setValues({
                            percentage: node.state['percentage'] - payload['percentageDelta']
                        }, node.state);
                    }
                    break;

                case "Alexa.PowerController": // PowerController
                    if (name === 'TurnOn') {
                        if (node.config.i_wake_on_lan_controller) {
                            cmd_res["name"] = "DeferredResponse";
                            event_payload['estimatedDeferralInSeconds'] = 15;
                            modified = [];
                            send_state_in_out = false;
                            process.nextTick(() => {
                                if (node.isVerbose()) node._debug("execDirective send_change_report");
                                // TODO manage response
                                node.alexa.send_change_report(node.id, [], "VOICE_INTERACTION", undefined, 'Alexa.WakeOnLANController', 'WakeUp')
                                    .then(res => {
                                        if (node.isVerbose()) node._debug("execDirective send_change_report for WakeUp OK");
                                        modified = node.setValues({
                                            powerState: 'ON'
                                        }, node.state);
                                        node.sendState(modified, payload, namespace, name);
                                        node.alexa.send_change_report(node.id, [], "VOICE_INTERACTION", {
                                            event: {
                                                header: {
                                                    correlationToken: header.correlationToken
                                                }
                                            }
                                        }, 'Alexa', 'Response')
                                            .then(() => { });
                                    })
                                    .catch(() => {
                                        if (node.isVerbose()) node._debug("execDirective send_change_report for WakeUp ERROR");
                                        node.alexa.send_error_response(undefined, undefined, node.id, 'INTERNAL_ERROR', 'Unknown error');
                                    });
                            });
                        } else {
                            modified = node.setValues({
                                powerState: 'ON'
                            }, node.state);
                        }
                    }
                    else if (name === 'TurnOff') {
                        modified = node.setValues({
                            powerState: 'OFF'
                        }, node.state);
                    }
                    break;

                case "Alexa.PlaybackController": // PlaybackController
                    if (node.config.a_playback_modes.includes(name)) {
                        modified = []
                    }
                    break;


                case "Alexa.PowerLevelController": // PowerLevelController
                    if (name === 'AdjustPowerLevel') {
                        modified = []
                    }
                    break;

                case "Alexa.SceneController": // SceneController
                    cmd_res['namespace'] = 'Alexa.SceneController';
                    if (name === 'Activate') {
                        modified = [];
                        cmd_res['name'] = 'ActivationStarted';
                    }
                    else if (name === 'Deactivate') {
                        modified = [];
                        cmd_res['name'] = 'DeactivationStarted';
                    }
                    event_payload['cause'] = {
                        type: "VOICE_INTERACTION"

                    };
                    event_payload['timestamp'] = new Date().toISOString();
                    break;

                case "Alexa.SecurityPanelController": // SecurityPanelController
                    if (name === 'Arm') {
                        cmd_res['namespace'] = 'Alexa.SecurityPanelController';
                        cmd_res['name'] = 'Arm.Response';
                        if (node.state['armState'] === payload['armState']) {
                            modified = [];
                        } else if (node.state['armState'] === 'DISARMED') {
                            node._debug("CCHI event_payload security_device_names_in_error " + JSON.stringify(node.security_device_names_in_error));
                            if (node.security_device_names_in_error.length > 0) {
                                let security_device_in_error = [];
                                for (const [id, name] of Object.entries(node.alexa.get_devices_id_name(node.security_device_names_in_error))) {
                                    security_device_in_error.push({
                                        friendlyName: name,
                                        endpointId: id
                                    });
                                }
                                if ('BYPASS_ALL' === (payload['bypassType'] || '')) {
                                    event_payload['bypassedEndpoints'] = security_device_in_error;
                                    modified = node.setValues({ armState: payload['armState'] }, node.state);
                                    const exit_delay = parseInt(node.config.exit_delay || 0);
                                    if (exit_delay > 0) {
                                        event_payload['exitDelayInSeconds'] = exit_delay;
                                    }
                                } else {
                                    event_payload['endpointsNeedingBypass'] = security_device_in_error;
                                    cmd_res['name'] = 'ErrorResponse';
                                    event_payload['type'] = 'BYPASS_NEEDED';
                                    event_payload['message'] = 'The security panel has open zones that the user must bypass.';
                                    modified = [];
                                }
                            } else {
                                modified = node.setValues({ armState: payload['armState'] }, node.state);
                                const exit_delay = parseInt(node.config.exit_delay || 0);
                                if (exit_delay > 0) {
                                    event_payload['exitDelayInSeconds'] = exit_delay;
                                }
                            }
                        } else {
                            cmd_res['name'] = 'ErrorResponse';
                            event_payload['type'] = 'AUTHORIZATION_REQUIRED';
                            event_payload['message'] = 'The security panel is already armed.';
                            modified = [];
                        }
                    }
                    else if (name === 'Disarm') {
                        cmd_res['namespace'] = 'Alexa';
                        cmd_res['name'] = 'Response';
                        if (node.state['armState'] === 'DISARMED') {
                            modified = [];
                        } else if (node.config.pin_code.trim().length > 0) {
                            if (payload.authorization && payload.authorization.type === 'FOUR_DIGIT_PIN' && payload.authorization.value === node.config.pin_code) {
                                modified = node.setValues({ armState: 'DISARMED' }, node.state);
                                // TODO Check Add alarms if any
                            } else {
                                cmd_res['name'] = 'ErrorResponse';
                                event_payload['type'] = 'UNAUTHORIZED';
                                event_payload['message'] = 'The PIN code is missing or not correct.';
                                modified = [];
                            }
                        } else {
                            modified = node.setValues({ armState: 'DISARMED' }, node.state);
                            // TODO Check Add alarms if any??
                        }
                    }
                    break;

                case "Alexa.Speaker": // Speaker
                    if (name === 'SetVolume') {
                        modified = node.setValues(payload, node.state);
                    }
                    else if (name === 'AdjustVolume') {
                        modified = node.setValues({
                            volume: node.state['volume'] + payload['volume']
                        }, node.state);
                    }
                    else if (name === 'SetMute') {
                        modified = node.setValues(payload, node.state);
                    }
                    break;

                case "Alexa.StepSpeaker": // StepSpeaker
                    if (name === 'AdjustVolume') {
                        modified = [];
                    }
                    break;

                case "Alexa.ThermostatController": // ThermostatController
                    if (name === 'SetTargetTemperature') {
                        modified = node.setValues(payload, node.state);
                        /*
                        if (payload.targetSetpoint === undefined) {
                            delete node.state.targetSetpoint;
                        }
                        if (payload.lowerSetpoint === undefined) {
                            delete node.state.lowerSetpoint;
                        }
                        if (payload.upperSetpoint === undefined) {
                            delete node.state.upperSetpoint;
                        }
                        */
                    }
                    else if (name === 'AdjustTargetTemperature') {
                        modified = []
                        if (typeof payload.targetSetpoint.value === 'number' && typeof node.state.targetSetpoint.value === 'number') {
                            // TODO check scale
                            node.state.targetSetpoint.value += payload.targetSetpoint.value;
                            modified.push('targetSetpoint');
                        }
                        if (typeof payload.lowerSetpoint.value === 'number' && typeof node.state.lowerSetpoint.value === 'number') {
                            // TODO check scale
                            node.state.lowerSetpoint.value += payload.lowerSetpoint.value;
                            modified.push('lowerSetpoint');
                        }
                        if (typeof payload.upperSetpoint.value === 'number' && typeof node.state.upperSetpoint.value === 'number') {
                            // TODO check scale
                            node.state.upperSetpoint.value += payload.upperSetpoint.value;
                            modified.push('upperSetpoint');
                        }
                    }
                    else if (name === 'SetThermostatMode') {
                        modified = node.setValues({
                            thermostatMode: payload.thermostatMode.value
                        }, node.state);
                    }
                    else if (name === 'ResumeSchedule') {
                        modified = []
                    }
                    break;

                default:
                    node.error("execDirective invalid directive " + name + "/" + namespace);
            }


            if (send_state_in_out && modified !== undefined) {
                node.sendState(modified, payload, namespace, name, other_data);
            }

            if (node.isVerbose()) node._debug("execDirective event_payload " + name + "/" + namespace + " " + JSON.stringify(event_payload));
            if (node.isVerbose()) node._debug("execDirective modified after " + name + "/" + namespace + " " + JSON.stringify(modified));
            if (node.isVerbose()) node._debug("execDirective state after " + name + "/" + namespace + " " + JSON.stringify(node.state));
            return modified;
        }

        //
        //
        //
        //
        sendState(modified, inputs, namespace, name, other_data) {
            var node = this;
            if (modified === undefined) {
                modified = [];
            }
            if (inputs === undefined) {
                inputs = {};
            }
            let msg = {
                inputs: inputs,
                payload: node.state,
                modified: modified,
                topic: node.config.topic,
                device: node.config.name
            };
            if (name) {
                msg.name = name;
            }
            if (namespace) {
                msg.namespace = namespace;
            }
            node.alexa.objectMerge(msg, other_data);
            node.send(msg);
            return node.state;
        }

        //
        //
        //
        //
        // https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html
        getProperties() {
            var node = this;
            const uncertainty = 500;
            let properties = [];
            const time_of_sample = (new Date()).toISOString();
            // BrightnessController
            if (node.config.i_brightness_controller) {
                properties.push({
                    namespace: "Alexa.BrightnessController",
                    name: "brightness",
                    value: node.state['brightness'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // ColorTemperatureController
            if (node.config.i_color_temperature_controller) {
                if (node.state['colorTemperatureInKelvin'] !== undefined) {
                    properties.push({
                        namespace: "Alexa.ColorTemperatureController",
                        name: "colorTemperatureInKelvin",
                        value: node.state['colorTemperatureInKelvin'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            // ColorController
            if (node.config.i_color_controller) {
                if (node.state['color'] !== undefined) {
                    properties.push({
                        namespace: "Alexa.ColorController",
                        name: "color",
                        value: node.state['color'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            // ContactSensor
            if (node.config.i_contact_sensor) {
                properties.push({
                    namespace: "Alexa.ContactSensor",
                    name: "detectionState",
                    value: node.state['contactDetectionState'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // EndpointHealth
            if (node.config.i_endpoint_health) {
                properties.push({
                    namespace: "Alexa.EndpointHealth",
                    name: "connectivity",
                    value: node.state['connectivity'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // EqualizerController
            if (node.config.i_equalizer_controller) {
                if (typeof node.state['bands'] === 'object') {
                    properties.push({
                        namespace: "Alexa.EqualizerController",
                        name: "bands",
                        value: node.state['bands'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (typeof node.state['mode'] === 'string') {
                    properties.push({
                        namespace: "Alexa.EqualizerController",
                        name: "mode",
                        value: node.state['mode'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            // LockController
            if (node.config.i_lock_controller) {
                properties.push({
                    namespace: "Alexa.LockController",
                    name: "lockState",
                    value: node.state['lockState'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // MotionSensor
            if (node.config.i_motion_sensor) {
                properties.push({
                    namespace: "Alexa.MotionSensor",
                    name: "detectionState",
                    value: node.state['motionDetectionState'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // PercentageController
            if (node.config.i_percentage_controller) {
                properties.push({
                    namespace: "Alexa.PercentageController",
                    name: "percentage",
                    value: node.state['percentage'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // SecurityPanelController
            if (node.config.i_security_panel_controller) {
                if (node.state['armState']) {
                    properties.push({
                        namespace: "Alexa.SecurityPanelController",
                        name: "armState",
                        value: node.state['armState'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                node.config.alarms.forEach(alarm => {
                    properties.push({
                        namespace: "Alexa.SecurityPanelController",
                        name: alarm,
                        value: node.state[alarm],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                });
            }
            // PowerController
            if (node.config.i_power_controller || node.config.i_wake_on_lan_controller) {
                properties.push({
                    namespace: "Alexa.PowerController",
                    name: "powerState",
                    value: node.state['powerState'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // TemperatureSensor
            if (node.config.i_temperature_sensor) {
                properties.push({
                    namespace: "Alexa.TemperatureSensor",
                    name: "temperature",
                    value: node.state['temperature'],
                    timeOfSample: time_of_sample,
                    uncertaintyInMilliseconds: uncertainty,
                });
            }
            // ThermostatController
            if (node.config.i_thermostat_controller) {
                if (node.state.targetSetpoint !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "targetSetpoint",
                        value: node.state['targetSetpoint'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (node.state.lowerSetpoint !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "lowerSetpoint",
                        value: node.state['lowerSetpoint'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (node.state.upperSetpoint !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "upperSetpoint",
                        value: node.state['upperSetpoint'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
                if (node.state.thermostatMode !== undefined) {
                    properties.push({
                        namespace: "Alexa.ThermostatController",
                        name: "thermostatMode",
                        value: node.state['thermostatMode'],
                        timeOfSample: time_of_sample,
                        uncertaintyInMilliseconds: uncertainty,
                    });
                }
            }
            return properties;
        }

        //
        //
        //
        //
        updateStatusIcon() {
            const node = this;
            let text = '';
            let fill = 'blue';
            let shape = 'dot';
            if (node.state.connectivity && node.state.connectivity.value !== undefined) {
                if (node.state.connectivity.value === 'OK') {
                    fill = 'green';
                } else {
                    fill = 'red';
                }
            }
            if (node.state.powerState !== undefined) {
                if (node.state.powerState === 'ON') {
                    text = 'ON';
                } else {
                    text = 'OFF';
                }
            }
            if (node.state.powerLevel !== undefined) {
                text += " P: " + node.state.powerLevel;
            }
            if (node.state.brightness !== undefined) {
                text += " bri: " + node.state.brightness;
            }
            if (node.state.colorTemperatureInKelvin !== undefined) {
                text += ' temp: ' + node.state.colorTemperatureInKelvin;
            }
            if (node.state.color !== undefined) {
                text += ' H: ' + node.state.color.hue +
                    ' S: ' + node.state.color.saturation +
                    ' B: ' + node.state.color.brightness;
            }
            if (node.state.lockState !== undefined) {
                text += ' ' + node.state.lockState;
            }
            if (node.state.armState !== undefined) {
                text += ' ' + node.state.armState;
            }
            if (node.state.percentage !== undefined) {
                text += ' ' + node.state.percentage + "% ";
            }
            if (node.state.volume !== undefined) {
                text += ' vol: ' + node.state.volume;
            }
            if (node.state.muted !== undefined && node.state.muted) {
                text += ' M';
            }
            if (node.state.temperature !== undefined) {
                text += ' T: ' + node.state.temperature.value;
            }
            if (node.state.targetSetpoint !== undefined) {
                text += ' TS: ' + node.state.targetSetpoint.value;
            }

            if (node.state.lowerSetpoint !== undefined && node.state.upperSetpoint !== undefined) {
                text += ' TS: [' + node.state.lowerSetpoint.value + ',' + node.state.upperSetpoint.value + ']';
            }

            if (node.state.motionDetectionState !== undefined) {
                text += node.state.motionDetectionState === 'DETECTED' ? ' MOTION' : ' NO MOTION';
            }

            if (node.state.contactDetectionState !== undefined) {
                text += node.state.contactDetectionState === 'DETECTED' ? ' CONTACT' : ' NO CONTACT';
            }
            if (node.state.connectivity !== undefined) {
                if (node.state.connectivity.value === 'UNREACHABLE') {
                    fill = 'red';
                } else if (fill !== 'red') {
                    fill = 'green';
                }
            }

            if (!text) {
                text = 'Unknown';
            }
            node.status({ fill: fill, shape: shape, text: text });
        }

        //
        //
        //
        //
        updateState(new_states) {
            const me = this;
            let modified = false;
            Object.keys(me.state_types).forEach(function (key) {
                if (new_states.hasOwnProperty(key)) {
                    if (me.setState(key, new_states[key], me.states, me.state_types[key], EXCLUSIVE_STATES[key] || {})) {
                        me._debug('.updateState: set "' + key + '" to ' + JSON.stringify(new_states[key]));
                        modified = true;
                    }
                }
            });
            me._debug('.updateState: new State ' + modified + ' ' + JSON.stringify(me.states));
            return modified;
        }

        //
        //
        //
        //
        cloneObject(cur_obj, new_obj, state_values, exclusive_states) {
            const me = this;
            let differs = false;
            if (exclusive_states === undefined) {
                exclusive_states = {};
            }
            Object.keys(state_values).forEach(function (key) {
                if (typeof new_obj[key] !== 'undefined' && new_obj[key] != null) {
                    if (me.setState(key, new_obj[key], cur_obj, state_values[key] || {}, exclusive_states[key] || {})) {
                        differs = true;
                    }
                } else if (typeof state_values[key] === 'number' && !(state_values[key] & formats.MANDATORY)) {
                    delete cur_obj[key];
                }
            });
            return differs;
        }

        //
        //
        //
        //
        formatValue(key, value, type) {
            let new_state;
            if (type & Formats.FLOAT) {
                new_state = formats.FormatValue(formats.Formats.FLOAT, key, value);
            } else if (type & Formats.INT) {
                new_state = formats.FormatValue(formats.Formats.INT, key, value);
            } else if (type & Formats.STRING) {
                new_state = formats.FormatValue(formats.Formats.STRING, key, value);
            } else if (type & Formats.BOOL) {
                new_state = formats.FormatValue(formats.Formats.BOOL, key, value);
            }
            return new_state;
        }

        //
        //
        //
        //
        setState(key, value, states, state_values, exclusive_states) {
            const me = this;
            let differs = false;
            let old_state = typeof states === 'object' ? states[key] : {};
            let new_state = undefined;
            let exclusive_states_arr = [];
            if (Array.isArray(exclusive_states)) {
                exclusive_states_arr = exclusive_states;
                exclusive_states = {};
            }
            if (typeof state_values === 'object') {
                if (typeof value === "object") {
                    if (Array.isArray(state_values)) {
                        if (Array.isArray(value)) {
                            // checks array
                            const ar_state_values = state_values[0];
                            if (typeof ar_state_values === 'number') {
                                let new_arr = [];
                                let old_arr = Array.isArray(old_state) ? old_state : [];
                                value.forEach((elm, idx) => {
                                    let new_val = me.formatValue(key + '[' + idx + ']', elm, ar_state_values);
                                    if (new_val !== undefined && new_val != null) {
                                        new_arr.push(new_val);
                                        if (old_arr.length > idx) {
                                            if (old_arr[idx] != new_val) {
                                                differs = true;
                                            }
                                        } else {
                                            differs = true;
                                        }
                                    } else {
                                        differs = true;
                                    }
                                });
                                states[key] = new_arr;
                            } else {
                                // structure check
                                let new_arr = [];
                                let old_arr = Array.isArray(old_state) ? old_state : [];
                                let key_id = state_values.length > 1 ? state_values[1] : undefined;
                                let add_if_missing = false;
                                let remove_if_no_data = false;
                                let is_valid_key = key => true;
                                let replace_all = false;
                                if (typeof key_id === 'object') {
                                    add_if_missing = key_id.addIfMissing || false;
                                    remove_if_no_data = key_id.removeIfNoData || false;
                                    if (typeof key_id.isValidKey === 'function') {
                                        is_valid_key = key_id.isValidKey;
                                    }
                                    if (typeof key_id.replaceAll === 'boolean') {
                                        replace_all = key_id.replaceAll;
                                    } else {
                                        replace_all = true;
                                    }
                                    key_id = key_id.keyId;
                                }
                                value.forEach((new_obj, idx) => {
                                    let cur_obj;
                                    if (key_id) {
                                        let f_arr;
                                        if (typeof key_id === 'string') {
                                            f_arr = old_arr.filter(obj => { return obj[key_id] === new_obj[key_id] });
                                        } else {
                                            f_arr = old_arr.filter(obj => {
                                                let obj_equal = true;
                                                key_id.forEach(key_idi => {
                                                    if (obj[key_idi] !== new_obj[key_idi]) {
                                                        obj_equal = false;
                                                    }
                                                });
                                                return obj_equal;
                                            });
                                        }
                                        if (f_arr.length > 1) {
                                            RED.log.error('More than one "' + key + '" for "' + key_id + '" "' + new_obj[key_id] + '"');
                                        } else if (f_arr.length > 0) {
                                            cur_obj = f_arr[0];
                                        } else if (add_if_missing) {
                                            let key_id0 = typeof key_id === 'string' ? key_id : key_id[0];
                                            let key1 = is_valid_key(new_obj[key_id0]);
                                            if (key1) {
                                                cur_obj = {};
                                                if (typeof key1 === 'string') {
                                                    new_obj[key_id0] = key1;
                                                }
                                                old_arr.push(cur_obj);
                                            }
                                        }
                                    } else {
                                        cur_obj = old_arr[idx];
                                        if (cur_obj === undefined && add_if_missing) {
                                            cur_obj = {};
                                        }
                                    }
                                    if (cur_obj !== undefined) {
                                        if (me.cloneObject(cur_obj, new_obj, ar_state_values, exclusive_states)) {
                                            differs = true;
                                        }
                                        if (Object.keys(cur_obj).length > 0) {
                                            new_arr.push(cur_obj);
                                        } else {
                                            differs = true; // ??
                                        }
                                    }
                                });
                                if (replace_all && new_arr.length != old_arr.length) {
                                    differs = true;
                                }
                                states[key] = replace_all ? new_arr : old_arr;
                                if (remove_if_no_data && states[key].length === 0) {
                                    delete states[key];
                                }
                            }
                        } else {
                            RED.log.error('key "' + key + '" must be an array.');
                        }
                    } else {
                        if (Array.isArray(value)) {
                            RED.log.error('key "' + key + '" must be an object.');
                        } else {
                            if (states[key] === undefined) {
                                states[key] = {};
                                old_state = states[key];
                            }
                            let mandatory_to_delete = [];
                            Object.keys(state_values).forEach(function (ikey) {
                                if (typeof value[ikey] !== 'undefined' && value[ikey] != null) {
                                    if (typeof old_state[ikey] == 'undefined') {
                                        old_state[ikey] = {};
                                    }
                                    if (me.setState(ikey, value[ikey], old_state, state_values[ikey], exclusive_states[ikey] || {})) {
                                        differs = true;
                                    }
                                } else if (typeof state_values[ikey] === 'number' && !(state_values[ikey] & formats.MANDATORY)) {
                                    if (typeof states[ikey] != 'undefined') {
                                        differs = true;
                                    }
                                    delete states[ikey];
                                } else {
                                    mandatory_to_delete.push(ikey);
                                }
                            });
                            mandatory_to_delete.forEach(ikey => {
                                const e_states = exclusive_states[ikey] || [];
                                let exclusive_state_found = false;
                                e_states.forEach(e_state => {
                                    if (typeof states[e_state] !== 'undefined') {
                                        exclusive_state_found = false;
                                    }
                                });
                                if (!exclusive_state_found) {
                                    if (typeof states[ikey] != 'undefined') {
                                        differs = true;
                                    }
                                    delete states[ikey];
                                } else {
                                    RED.log.error('key "' + key + '.' + ikey + '" is mandatory.');
                                }
                            });
                        }
                    }
                } else {
                    if (Array.isArray(old_state)) {
                        RED.log.error('key "' + key + '" must be an array.');
                    } else {
                        RED.log.error('key "' + key + '" must be an object.');
                    }
                }
            } else if (state_values & Formats.COPY_OBJECT) {
                if (typeof value !== 'object' || Array.isArray(value)) {
                    RED.log.error('key "' + key + '" must be an object.');
                } else {
                    Object.keys(old_state).forEach(function (key) {
                        if (typeof value[key] !== 'undefined') {
                            if (me.setState(key, value[key], old_state, state_values - Formats.COPY_OBJECT, {})) {
                                differs = true;
                            }
                        }
                    });
                }
            } else if (value == null) {
                if (state_values & Formats.MANDATORY) {
                    RED.log.error("key " + key + " is mandatory.");
                } else if (states.hasOwnProperty(key)) {
                    delete states[key];
                    differs = true;
                }
            } else if (state_values & Formats.FLOAT) {
                new_state = formats.FormatValue(formats.Formats.FLOAT, key, value);
            } else if (state_values & Formats.INT) {
                new_state = formats.FormatValue(formats.Formats.INT, key, value);
            } else if (state_values & Formats.STRING) {
                new_state = formats.FormatValue(formats.Formats.STRING, key, value);
            } else if (state_values & Formats.BOOL) {
                new_state = formats.FormatValue(formats.Formats.BOOL, key, value);
            }
            if (typeof state_values !== 'object') {
                if (new_state !== undefined) {
                    differs = old_state !== new_state;
                    states[key] = new_state;
                }
            }
            if (differs) {
                exclusive_states_arr.forEach(rkey => delete states[rkey]);
            }
            return differs;
        }

        //
        //
        //
        //
        setValues(from_object, to_object) {
            var node = this;
            let differs = [];
            Object.keys(to_object).forEach(function (key) {
                if (from_object.hasOwnProperty(key)) {
                    if (node.setValue(key, from_object[key], to_object, float_values[key] || {})) {
                        differs.push(key);
                    }
                }
            });
            node.updateStatusIcon();
            return differs;
        }

        //
        //
        //
        //
        setValue(key, value, to_object, float_values) {
            var node = this;
            let differs = false;
            const old_value = to_object[key];
            const val_type = typeof old_value;
            let new_value = undefined;
            if (val_type === 'number') {
                if (float_values) {
                    new_value = parseFloat(String(value));
                    if (isNaN(new_value)) {
                        throw new Error('Unable to convert "' + value + '" to a float');
                    }
                } else {
                    new_value = parseInt(String(value));
                    if (isNaN(new_value)) {
                        throw new Error('Unable to convert "' + value + '" to a float');
                    }
                }
            } else if (val_type === 'string') {
                new_value = String(value);
            } else if (val_type === 'boolean') {
                switch (String(value).toUpperCase()) {
                    case "TRUE":
                    case "ON":
                    case "YES":
                    case node.YES:
                    case "1":
                        new_value = true;
                        break;
                    case "FALSE":
                    case "OFF":
                    case "NO":
                    case node.NO:
                    case "0":
                        new_value = false;
                        break;
                    default:
                        throw new Error('Unable to convert "' + value + '" to a boolean');
                }
            } else if (val_type === 'object') {
                if (typeof value === "object") {
                    if (Array.isArray(old_value)) {
                        if (Array.isArray(value)) {
                            if (JSON.stringify(to_object[key]) != JSON.stringify(value)) {
                                differs = true;
                            }
                            to_object[key] = value;
                        } else {
                            throw new Error('key "' + key + '" must be an array.');
                        }
                    } else {
                        if (Array.isArray(value)) {
                            throw new Error('key "' + key + '" must be an object.');
                        }
                        Object.keys(old_value).forEach(function (key) {
                            if (typeof value[key] !== 'undefined') {
                                if (node.setValue(key, value[key], old_value, float_values[key] || {})) {
                                    differs = true;
                                }
                            }
                        });
                    }
                } else {
                    if (Array.isArray(old_value)) {
                        throw new Error('key "' + key + '" must be an array.');
                    }
                    throw new Error('key "' + key + '" must be an object.');
                }
            }
            if (val_type !== 'object') {
                if (new_value !== undefined) {
                    differs = old_value !== new_value;
                    to_object[key] = new_value;
                }
            }
            return differs;
        }
        //
        //
        //
        //
        to_int(value, default_value) {
            const n = parseInt(value);
            const f = parseFloat(value);
            if (!isNaN(value) && Number.isInteger(f)) {
                return n;
            }
            return default_value;
        }
        //
        //
        //
        //
        to_float(value, default_value) {
            if (isNaN(value)) {
                return default_value;
            }
            return parseFloat(value);
        }
    }
    RED.nodes.registerType("alexa-device", AlexaDeviceNode);
}
