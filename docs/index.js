/*
Copyright 2022 Claudio Chimera <Claudio.Chimera at gmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const https = require('https')
const base_url = process.env.BASE_URL
const d = 'True' == process.env.DEBUG

const { hostname = "localhost", pathname = "/", s_port, protocol } = new URL(base_url);
const port = s_port ? parseInt(s_port) : protocol === 'https:' ? 443 : 80

if (d) {
  console.log('url: ' + base_url)
  console.log('hostname: ' + hostname)
  console.log('pathname: ' + pathname)
  console.log('port: ' + port)
  console.log('protocol: ' + protocol)
}

const options = {
  hostname: hostname,
  path: pathname,
  method: 'POST',
  port: port,
  headers: {
    'Content-Type': 'application/json',
  },
};

function getError(err) {
  return {
    'event': {
      'payload': {
        'type': 'INTERNAL_ERROR',
        'message': err,
      }
    }
  };
}

exports.handler = async (event) => {
  if (d) {
    console.log("event: " + JSON.stringify(event))
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let rawData = '';

      res.on('data', chunk => {
        rawData += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(rawData));
        } catch (err) {
          if (d) console.log("rawData: " + rawData)
          resolve(getError(rawData));
        }
      });
    });

    req.on('error', err => {
      if (d) console.log("reject: " + err)
      resolve(getError(err));
    });

    req.write(JSON.stringify(event));
    req.end();
  });
};
