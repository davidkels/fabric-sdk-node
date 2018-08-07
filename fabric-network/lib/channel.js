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
const FabricConstants = require('fabric-client/lib/Constants');
const Contract = require('./contract');

class Channel {

	constructor(network, channel) {
		this.network = network;
		this.channel = channel;

		const options = network.getOptions();
		this.discoveryOptions = options.discoveryOptions;
		this.useDiscovery = options.useDiscovery;

		this.eventHandlerFactory;
		this.queryHandler;
		this.peerMap;
		this.contracts = new Map();
		this.initialized = false;
	}

	/**
	 * create a map of mspId's and the channel peers in those mspIds
	 *
	 * @memberof Network
	 */
	_mapPeersToMSPid() {
		// TODO: assume 1-1 mapping of mspId to org as the node-sdk makes that assumption
		// otherwise we woukd need to find the channel peer in the network config collection or however SD
		// stores things

		const peerMap = new Map();
		const channelPeers = this.channel.getPeers();

		// bug in service discovery, peers don't have the associated mspid
		if (channelPeers.length > 0) {
			for (const channelPeer of channelPeers) {
				const mspId = channelPeer.getMspid();
				if (mspId) {
					let peerList = peerMap.get(mspId);
					if (!peerList) {
						peerList = [];
						peerMap.set(mspId, peerList);
					}
					peerList.push(channelPeer);
				}
			}
		}
		if (peerMap.size === 0) {
			throw new Error('no suitable peers associated with mspIds were found');
		}
		return peerMap;
	}

	/**
     * initialize the channel if it hasn't been done
     * @private
     */
	async _initializeInternalChannel() {
		//TODO: Should this work across all peers or just orgs peers ?
		//TODO: should sort peer list to the identity org initializing the channel.
		//TODO: Candidate to push to low level node-sdk.

		const ledgerPeers = this.channel.getPeers().filter((cPeer) => {
			return cPeer.isInRole(FabricConstants.NetworkConfig.LEDGER_QUERY_ROLE);
		});

		if (ledgerPeers.length === 0) {
			throw new Error('no suitable peers available to initialize from');
		}

		let ledgerPeerIndex = 0;
		let success = false;

		while (!success) {
			try {
				const initOptions = {
					target: ledgerPeers[ledgerPeerIndex]
				};
				if (this.useDiscovery) {
					initOptions.discover = true;
					if (this.discoveryOptions && this.discoveryOptions.asLocalhost) {
						initOptions.asLocalhost = this.discoveryOptions.asLocalhost;
					}
				}

				await this.channel.initialize(initOptions);
				success = true;
			} catch(error) {
				if (ledgerPeerIndex >= ledgerPeers.length - 1) {
					throw new Error(`Unable to initalize channel. Attempted to contact ${ledgerPeers.length} Peers. Last error was ${error}`);
				}
				ledgerPeerIndex++;
			}
		}
	}

	async initialize() {
		if (this.initialized) {
			return;
		}

		await this._initializeInternalChannel();
		this.peerMap = this._mapPeersToMSPid();

		// TODO: only required if submit notify is to be used
		// TODO: we need to filter down the event source peers based on roles, for now we will assume all in the peerMap are event sources
		// or assume the plugins do the work
		// create an event handler factory for the channel
		this.eventHandlerFactory = await this.network._createEventHandlerFactory(this.channel, this.peerMap);

		// TODO: we need to filter down the queryable peers based on roles, for now we will assume all in the peerMap are chaincode queryable
		// or assume the plugins do the work
		// create a query handler for the channel.
		this.queryHandler = await this.network._createQueryHandler(this.channel, this.peerMap);

		this.initialized = true;
	}

	getInternalChannel() {
		return this.channel;
	}

	getPeerMap() {
		return this.peerMap;
	}

	async rediscover() {
		// TODO: This still needs to be done
		// what happens if the list of peers changes ?
		// 1. need to rebuild an eventHandlerFactory and queryHandler for the channel
		// 2. need to inform existing contracts to swap to the new handlers
	}

	getContract(chaincodeId) {
		// check initialized flag
		// Create the new Contract
		let contract = this.contracts.get(chaincodeId);
		if (!contract) {
			contract = 	new Contract(
				this.channel,
				chaincodeId,
				this.eventHandlerFactory,
				this.queryHandler,
				this.network
			);
		}
		return contract;
	}

	getEventHubs() {
		if (this.eventHandlerFactory) {
			return this.eventHandlerFactory.getEventHubs();
		}
		return [];
	}

	cleanup() {
		// Danger as this cached in network, and also async so how would
		// channel.cleanup() followed by channel.initialize() be safe ?
		// make this private is the safest option.
		if (this.eventHandlerFactory) {
			this.eventHandlerFactory.cleanup();
		}
		if (this.queryHandler) {
			this.queryHandler.cleanup();
		}
		this.contracts.clear();
		this.initialized = false;
	}

}

module.exports = Channel;
