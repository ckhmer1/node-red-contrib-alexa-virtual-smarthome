"""
Copyright 2019 Jason Hu <awaregit at gmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""
import os
import json
import logging
import urllib3

_debug = bool(os.environ.get('DEBUG'))

_logger = logging.getLogger('HomeAssistant-SmartHome')
_logger.setLevel(logging.DEBUG if _debug else logging.INFO)


def lambda_handler(event, context):
    """Handle incoming Alexa directive."""

    _logger.debug('Event: %s', event)

    base_url = os.environ.get('BASE_URL')
    assert base_url is not None, 'Please set BASE_URL environment variable'

    http = urllib3.PoolManager(
        cert_reqs='CERT_REQUIRED',
        timeout=urllib3.Timeout(connect=2.0, read=10.0)
    )

    response = http.request(
        'POST',
        base_url,
        headers={
            'Content-Type': 'application/json',
        },
        body=json.dumps(event).encode('utf-8'),
    )
    if response.status >= 400:
        return {
            'event': {
                'payload': {
                    'type': 'INVALID_AUTHORIZATION_CREDENTIAL'
                    if response.status in (401, 403) else 'INTERNAL_ERROR',
                    'message': response.data.decode("utf-8"),
                }
            }
        }
    return json.loads(response.data.decode('utf-8'))
