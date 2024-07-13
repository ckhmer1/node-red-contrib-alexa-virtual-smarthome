const superagent = require('superagent');
const fs = require('fs');

console.log("Starting ");

const cid = 'CID';
const sec = 'SEC';
const uri = 'https://smart-home.XXXXXXX.dynu.com/alexa/oauth';

fs.readFile('alexa-token.json', 'utf8', function (err, data) {
  if (err) {
    console.log("Error " + err);
  } else {
    let token = JSON.parse(data);
    superagent
      .post('https://api.amazon.com/auth/o2/token')
      .set("Authorization", "Basic " + Buffer.from(cid + ":" + sec).toString("base64"))
      // .set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: token.lwa_refresh_token,
        redirect_uri: uri
      })
      .then(res => {
        console.log("res " + JSON.stringify(res));
      })
      .catch(err => {
        console.log("err " + JSON.stringify(err));
      });
  }
});

