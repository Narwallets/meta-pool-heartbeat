# meta-pool-adapter

The meta-pool heartbeat is a server process functioning as heart-beat for the meta-pool contract in the NEAR blockchain

## Technical details

This nodejs server is written in typescript. 

It periodically calls `distribute_stake()` and `distribute_unstake()`

### Stats report

This server also exposes an HTTP endpoint (default port 7001) to:
* show server stats 
* show server log
* keep-alive response for the process watchdog
* shutdown the process (will be restarted by pm2)


## Testnet Deployment Instructions

* You must deploy the [meta-pool contract](https://github.com/Narwallets/meta-pool) in testnet
* make sure the meta-pool-heartbeat server code is referencing your NEAR master account (see MASTER_ACCOUNT & GATEWAY_CONTRACT_ID at [main.ts](src/main.ts))

## Integration Test Instructions

You need to have the server running and processing requests and also you need a user operationg the contract

* Start `node dist/main`

* operate the contract via the web UI

You can navigate to localhost:8000 to check stats on the heartbeat server.


## Production Deployment Instructions

* You must deploy the [meta-pool contract](https://github.com/Narwallets/meta-pool) in NEAR mainnet
* You need to have [pm2 installed](https://github.com/Unitech/pm2) in your server
* `git clone/pull` this repo in your server
* make sure the meta-pool-heartbeat server code is referencing your NEAR master account  (see MASTER_ACCOUNT & GATEWAY_CONTRACT_ID at [main.ts](src/main.ts))
* make sure the server has the MASTER_ACCOUNT credentials (check `~/.near-credentials/default`. You can use `near login` to get the credentials file generated)
* in the repo dir type: `npm start`

```
> git clone https://github.com/Narwallets/meta-pool-heartbeat.git
> cd meta-pool-heartbeat
meta-pool-heartbeat> npm install
meta-pool-heartbeat> npm start
```

The meta-pool-heartbeat process will be run, and restarted when necessary by pm2.<br>
The pm2 configuration is at [ecosystem.config.js](ecosystem.config.js)
<br>
Use http://localhost:7001 to check the meta-pool-heartbeat process status.
