#!/usr/bin/env python3
# Залить/сбросить общий team-notes.md в Object Storage (владельцу — чистка/восстановление базы).
#   env: KEY_ID, SECRET, BUCKET, OBJECT_KEY (по умолчанию team-notes.md)
#   usage: KEY_ID=.. SECRET=.. BUCKET=.. python3 seed.py <path-to-md>
# S3 PUT с подписью AWS SigV4 на стандартной библиотеке (без aws-cli/boto3).
import hashlib, hmac, datetime, os, sys, urllib.request

def _sign(k, m): return hmac.new(k, m.encode(), hashlib.sha256).digest()
def _sigkey(sec, d, r, sv):
    kd = _sign(('AWS4' + sec).encode(), d); kr = _sign(kd, r); ks = _sign(kr, sv)
    return _sign(ks, 'aws4_request')

def put(path):
    a = os.environ['KEY_ID']; s = os.environ['SECRET']; b = os.environ['BUCKET']
    key = os.environ.get('OBJECT_KEY', 'team-notes.md')
    region, service, host = 'ru-central1', 's3', 'storage.yandexcloud.net'
    body = open(path, 'rb').read()
    now = datetime.datetime.now(datetime.timezone.utc)
    amz = now.strftime('%Y%m%dT%H%M%SZ'); ds = now.strftime('%Y%m%d')
    ph = hashlib.sha256(body).hexdigest()
    uri = f'/{b}/{key}'
    ch = f'host:{host}\nx-amz-content-sha256:{ph}\nx-amz-date:{amz}\n'
    sh = 'host;x-amz-content-sha256;x-amz-date'
    creq = f'PUT\n{uri}\n\n{ch}\n{sh}\n{ph}'
    scope = f'{ds}/{region}/{service}/aws4_request'
    sts = f'AWS4-HMAC-SHA256\n{amz}\n{scope}\n' + hashlib.sha256(creq.encode()).hexdigest()
    sig = hmac.new(_sigkey(s, ds, region, service), sts.encode(), hashlib.sha256).hexdigest()
    auth = f'AWS4-HMAC-SHA256 Credential={a}/{scope}, SignedHeaders={sh}, Signature={sig}'
    req = urllib.request.Request(f'https://{host}{uri}', data=body, method='PUT', headers={
        'Authorization': auth, 'x-amz-date': amz, 'x-amz-content-sha256': ph,
        'Content-Type': 'text/markdown; charset=utf-8'})
    return urllib.request.urlopen(req, timeout=20).status

if __name__ == '__main__':
    print('PUT', put(sys.argv[1]))
