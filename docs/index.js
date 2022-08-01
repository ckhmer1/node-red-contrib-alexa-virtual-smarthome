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
