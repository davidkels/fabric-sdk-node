/*
 Copyright 2018 IBM All Rights Reserved.

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
'use strict';

//TODO: What about chaincode events ?
//TODO: Expose access to the eventhubs

const Client = require('fabric-client');
const Contract = require('./contract');
const FABRIC_CONSTANTS = require('fabric-client/lib/Constants');

//let logger = utils.getLogger('Network.js');

class Network {

	constructor() {
		this.client = null;
		this.channelStatus = {};
		this.options = {
			commitTimeout: 300 * 1000
		};
		this.wallet = null;
	}

	async initialize(ccp, options) {
		//TODO: initialise from discovery
		this.client = Client.loadFromConfig(ccp);

		// TODO: Need to consider HSM
		Object.assign(this.options, options);
		if (options && options.identity && options.wallet) {
			await options.wallet.setClient(this.client);
			await options.wallet.setUserContext(options.identity);
		}
	}


	_connectEventHubs(channel) {
		//TODO: Need to determine strategy here
		const orgPeers = this.client.getPeersForOrg();
		let eventHubs = this.channelStatus[channel.getName()].eventHubs;
		if (!eventHubs) {
			let eventHubs = [];
			if (orgPeers.length > 0) {
				let eventHub = channel.newChannelEventHub(orgPeers[0]);
				eventHubs.push(eventHub);
				//TODO: need to control this somehow, users may not want full block retrieval
				eventHub.connect(true);
			}
			else {
				throw new Error('No peers in org or no org defined');
			}
			this.channelStatus[channel.getName()].eventHubs = eventHubs;
		}
		return eventHubs;
	}

	getClient() {
		return this.client;
	}

	/**
     * initialize the channel if it hasn't been done, manipulate the peer list in the channel to cycle
     * through ledger peers if any are down. This is a workaround until a better soln from
     * https://jira.hyperledger.org/browse/FAB-10065
     * is available.
     * @private
     */
	async _initializeChannel(channelName) {
		//TODO: Should this work across all peers or just orgs peers.
		const method = '_initializeChannel';

		const channel = this.client.getChannel(channelName);

		/*
		const ledgerPeers = channel.getPeers().filter((cPeer) => {
			console.log(cPeer);
			return cPeer.isInRole(FABRIC_CONSTANTS.NetworkConfig.LEDGER_QUERY_ROLE);
		});
		*/

		//console.log(channel);
		const ledgerPeers = [];
		channel._channel_peers.forEach((cPeer) => {
			if (cPeer.isInRole(FABRIC_CONSTANTS.NetworkConfig.LEDGER_QUERY_ROLE)) {
				ledgerPeers.push(cPeer.getPeer());
			}
		});

		let ledgerPeerIndex = 0;

		// TODO: this needs to work with the new initialize call to channel
		// also ideally we should resort the peer list to be your org first
		while (!this.channelStatus[channelName]) {
			try {
				await channel.initialize();
				this.channelStatus[channelName] = {initialized: true};
			} catch(error) {
				if (ledgerPeerIndex === ledgerPeers.length - 1) {
					throw new Error(`Unable to initalize channel. Attempted to contact ${ledgerPeers.length} Peers. Last error was ${error}`);
				}
				ledgerPeerIndex++;
				const nextPeer = ledgerPeers[ledgerPeerIndex];
				const peerIndex = channel.getPeers().indexOf(nextPeer);
				channel.getPeers().splice(peerIndex, 1);
				channel.getPeers().unshift(nextPeer);
			}
		}
		return channel;
	}

	async disconnect() {
		for (let channelName in this.channelStatus) {
			let channelDef = this.channelStatus[channelName];
			channelDef.eventHubs[0].disconnect();
		}
	}

	//TODO: will hang unless we disconnect the event hubs

    async getContract(channelName, chaincodeId) {
        const channel = await this._initializeChannel(channelName);
        const eventHubs = this._connectEventHubs(channel);
        return new Contract(channel, chaincodeId, eventHubs, this);
    }

}


module.exports = Network;
