# Alexa Smart Home Node Red module

## Table of Contents
- [Introduction](#introduction)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [The Config node](#the-config-node)
- [The Device node](#the-device-node)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)
- [Copyright and license](#copyright-and-license)

---
## Introduction

A collection of Node-RED nodes to control your smart home devices via Amazon Alexa or the Alexa App.

This module does NOT directly interface with devices made by Amazon.

---
## Prerequisites

1. A host reachable from Amazon Alexa with a fixed IP address or a domain name with a fixed IP address or a domain name with the dynamic DNS server (refers to this in instructions as YOUR_DOMAIN) e.g. your_domain.it.
2. A 'real' SSL certificate for the host e.g. from [Let’s Encrypt](https://letsencrypt.org).
3. A reverse proxy, like nginx, forwarding the Amazon request to the Node-RED server.
4. Forward TCP traffic coming in from the Internet to your reverse proxy server.
5. Node-RED installed using an updated NodeJS version.
6. An [Amazon Developer](https://developer.amazon.com) account (use the same username used in the Amazon Alexa App or Alexa devices).
7. An [Amazon Web Service (AWS)](https://console.aws.amazon.com) account (use the same username used in the Amazon Alexa App or Alexa devices).

---
## Setup Instructions

Follow the [setup instructions](docs/setup_instructions.md).

## The Config node

#### Fill the config node in the following way (You need exactly one config node):

* "Name": a name, e.g.: "Alexa".
* "Login with Amazon", checked.
* "Client id": the value copied in [(1)](#add-your-website-to-your-security-profile).
* "Secret": the value copied in [(2)](#add-your-website-to-your-security-profile).
* "Allowed emails": add the email used to login with Amazon.
* "Alexa skill client id": the value copied in [(9)](#configure-the-service-endpoint).
* "Alexa skill secret": the value copied in [(10)](#configure-the-service-endpoint).
* "Your client id": the value copied in [(5)](#configure-the-service-endpoint).
* "Your secret": the value copied in [(6)](#configure-the-service-endpoint).
* "Scope": the value copied in [(7)](#configure-the-service-endpoint)., e.g.: "smart_home".
* "Event endpoint": enter the endpoint for your region. See [Send Events to the Correct URL](https://developer.amazon.com/en-US/docs/alexa/smarthome/develop-smart-home-skills-in-multiple-languages.html#send-events-to-the-correct-url).
* "HTTP Port": You can leave it empty for using the same Node-RED port, or fill it with a port number. You need to redirect the "/alexa/" HTTPS traffic on this port.
* "HTTP Path": enter "alexa". If You change it, You need to adapt all the uri in the Amazon configuration.
* "Verbose log": enable it only for troubleshooting.

## The Device node

This is the "real" device node, configure the following info:

* "Alexa": the alexa config node.
* "Name": the device name.
* "Out topic": the topic used when a voice command is received.
* "Display categories": the display categories. See [Display categories](https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-discovery.html#display-categories) for more info.
* "Interfaces": the interfaces supported by the device. See [Interfaces](https://developer.amazon.com/en-US/docs/alexa/device-apis/list-of-interfaces.html) for more info.

Example flow:
        See the flow used for the tests [here](test/flows.json)

## Troubleshooting

This is a checklist for the config:

### Check the forward rule for /alexa/oauth

* Open your browser at "https://YOUR_DOMAIN/alexa/oauth"
* You should get the message "Wrong client id". If not, check your port forwarding the reverse proxy or reverse proxy config.


### Check the forward rule for /alexa/token
* Enable the debug log in the Node-Red Alexa node configuration.
* Open your browser at "https://YOUR_DOMAIN/alexa/token"
* You should get the message "https://YOUR_DOMAIN/alexa/token". If not, check your port forwarding to the reverse proxy  or reverse proxy config.

### Check the forward rule for /alexa/smarthome
* Enable the debug log in the Node-Red Alexa node configuration.
* Open your browser at "https://YOUR_DOMAIN/alexa/smarthome"
* You should get the following message:

```
Alexa SmartHome test page

Url: https://YOUR_DOMAIN/alexa/smarthome
Post: {"ok":"ok"}
```

If not, check your port forwarding to the reverse proxy or reverse proxy config.

### Check the lambda function

* Enable the debug log in the Node-Red Alexa node configuration.
* Open your browser at [AWS lambda](https://eu-west-1.console.aws.amazon.com/lambda/home)
* Click on the "SmartHome" function
* Click on the "Execute Test" tab
* Paste the following message on the editor:

```
{
  "directive": {
    "header": {
      "namespace": "Test",
      "name": "Test",
      "messageId": "<message id>",
      "payloadVersion": "3"
    },
    "payload": {
      "grant": {
        "type": "OAuth2.AuthorizationCode",
        "code": "Test"
      },
      "grantee": {
        "type": "BearerToken",
        "token": "Test"
      }
    }
  }
}
```
* Click on "Execute test" button
* Click on detail, You should see the following response:
```
{
  "ok": "ok"
}
```

### Check the Alexa account linking

* Enable the debug log in the Node-Red Alexa node configuration.
* Follow the - [Link your account with your Smart Home skill](#Link-your-account-with-your-Smart-Home-skill)
* Open the Node-RED gui, and check the debug window, You should see the following info:

```
node: Alexa
msg : string[15]
"oauth_get login"
```

```
node: Alexa
msg : string[17]
"oauth_get profile"
```

```
node: Alexa
msg : string[37]
"Username xxxxxxx@gmail.com authorized"
```

```
node: Alexa
msg : string[29]
"token_post authorization_code"
```

```
node: Alexa
msg : string[37]
"smarthome_post: oauth_get AcceptGrant"
```

### Nginx reverse proxy configuration

Following is a sample forwarding config for Nginx

```
        location ~ ^/alexa/(oauth|token|smarthome) {
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_pass http://192.168.0.3:3001;
        }
```


## Credits
Parts of this README and large parts of the code comes from Amazon guide.

## Copyright and license
Copyright 2021 Claudio Chimera under [the GNU General Public License version 3](LICENSE).
