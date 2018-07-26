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

const Client = require('fabric-client');
const Contract = require('./contract');
const FABRIC_CONSTANTS = require('fabric-client/lib/Constants');
const EventHandlerConstants = require('./impl/event/defaulteventstrategies');


class Network {

	constructor() {
		this.client = null;
		this.channelStatus = {};

		this.options = {
			commitTimeout: 300 * 1000,
			eventHandlerFactory: './impl/event/defaulteventhandlerfactory',
			// not appropriate options if not the above impl
			eventHandlerOptions: {
				strategy: EventHandlerConstants.MSPID_SCOPE_ALLFORTX,
				timeout: 60
			},
			queryHandler: './impl/query/defaultqueryhandler',
			queryHandlerOptions: {
			},
			// TODO: discovery-cache-age (only used by getDiscoveryResults)
			// TODO: expose refresh.
			// TODO: We need a timeout when submitTransaction is called to determine if a refresh should
			// be made.
			useDiscovery: false,
			discoverOptions: {
				// These are the defaults set by the node-sdk, can use env vars
				// or programmatically specify through the options.
				// discoveryProtocol: 'grpcs',
				// asLocalhost: false
				// discoveryRefresh: 300000 (TODO: on a timeout or only when submit is done ?)
			}
		};
		this.wallet = null;
	}

	/**
	 * initialize the network with a connection profile (either for static purposes or for initial discovery info)
	 *
	 * @param {*} ccp
	 * @param {*} options
	 * @memberof Network
	 */
	async initialize(ccp, options) {
		if (!options || !options.wallet) {
			throw new Error('A wallet must be assigned to a Network instance');
		}

		Object.assign(this.options, options);
		let factory = this.options.eventHandlerFactory;


		// initialize the behaviours for event handling and querying
		// we will default to the standard node-sdk behaviours for
		// submission which are
		// 1. if using a CCP then submit to all peers defined in the channel that are ENDORSING_PEERS
		// 2. use the standard Service Discovery Plugin.
		if (this.options.eventHandlerFactory) {
			try {
				this.eventHandlerFactory = require(factory);
			} catch(error) {
				console.log(error);
				throw new Error('unable to load provided event handler factory: ' + factory);
			}
		}

		let handler = this.options.queryHandler;
		try {
			this.queryHandlerClass = require(handler);
		} catch(error) {
			console.log(error);
			throw new Error('unable to load provided query handler: ' + handler);
		}

		// These are global to the app, but would assume you won't want a mixture of discover and non discover
		if (this.options.useDiscovery && this.options.discoverOptions && this.options.discoverOptions.discoveryProtocol) {
			Client.setConfigSetting('discovery-protocol', this.options.discoverOptions.discoveryProtocol);
		}

		// still use a ccp for the discovery peer and ca information
		this.client = Client.loadFromConfig(ccp);

		// setup an initial identity for the network
		if (options.identity) {
			this.currentIdentity = await options.wallet.setUserContext(this.client, options.identity);
		}
	}

	async rediscover(channelName) {
		// TODO: This still needs to be done
		// what happens if the list of peers changes ?
		// 1. need to rebuild an eventHandlerFactory and queryHandler for the channel
		// 2. need to inform existing contracts to swap to the new handlers
	}

	/**
	 * Allow you to switch the identity used by contracts of this network
	 *
	 * @param {*} newIdentity
	 * @memberof Network
	 */
	async setIdentity(newIdentity) {
		//TODO: what to do if mspId changes ? all contracts are not useable as the default query peers and maybe the event
		// hubs are tied to a specific mspId. What happens if users write their own handlers ?
		// What happens if you are in the middle of interacting with a contract ?
		// also what if you are using ABAC and swap identities ? even if the mspId doesn't change.
		// Think this all boils down to the fact you cannot switch identities, you can only set it once
		if (this.currentIdentity) {
			throw new Error('The identity for this network has already been set. It cannot be changed');
		}
		this.currentIdentity = await this.options.wallet.setUserContext(this.client, newIdentity);
	}

	/**
	 * get the current identity
	 *
	 * @returns
	 * @memberof Network
	 */
	getCurrentIdentity() {
		return this.currentIdentity;
	}

	/**
	 * get the underlying client instance
	 *
	 * @returns
	 * @memberof Network
	 */
	getClient() {
		return this.client;
	}

	/**
	 * get the event hubs being used for a specific channel
	 *
	 * @param {*} channelName
	 * @returns
	 * @memberof Network
	 */
	getEventHubs(channelName) {
		if (this.channelStatus[channelName] && this.channelStatus[channelName].eventHandlerFactory) {
			return this.channelStatus[channelName].eventHandlerFactory.getEventHubs();
		}
	}

	/**
	 * clean up this network in prep for it to be discarded and garbage collected
	 *
	 * @memberof Network
	 */
	async cleanup() {
		for (let channelName in this.channelStatus) {
			if (this.channelStatus[channelName].eventHandlerFactory) {
				this.channelStatus[channelName].eventHandlerFactory.disconnect();
				delete this.channelStatus[channelName].eventHandlerFactory;
			}
		}
	}

	/**
     * initialize the channel if it hasn't been done
     * @private
     */
	async _initializeChannel(channel) {
		//TODO: Should this work across all peers or just orgs peers ?
		//TODO: should sort peer list to the identity org initializing the channel.

		const ledgerPeers = channel.getPeers().filter((cPeer) => {
			return cPeer.isInRole(FABRIC_CONSTANTS.NetworkConfig.LEDGER_QUERY_ROLE);
		});

		if (ledgerPeers.length === 0) {
			throw new Error('no suitable peers available to initialize from');
		}

		let ledgerPeerIndex = 0;
		let success = false;

		while (!success) {
			try {
				let discoverOptions = null;
				if (this.options.useDiscovery) {
					discoverOptions = {
						discover: true
					};
					if (this.options.discoverOptions && this.options.discoverOptions.asLocalhost) {
						discoverOptions.asLocalhost = this.options.discoverOptions.asLocalhost;
					}
				}

				await channel.initialize(discoverOptions);
				success = true;
			} catch(error) {
				if (ledgerPeerIndex >= ledgerPeers.length - 1) {
					throw new Error(`Unable to initalize channel. Attempted to contact ${ledgerPeers.length} Peers. Last error was ${error}`);
				}
				ledgerPeerIndex++;
			}
		}
	}

	/**
	 * create a map of mspId's and the channel peers in those mspIds
	 *
	 * @memberof Network
	 */
	_mapPeersToMSPid(channel) {
		// TODO: assume 1-1 mapping of mspId to org as the node-sdk makes that assumption
		// otherwise we woukd need to find the channel peer in the network config collection or however SD
		// stores things

		const peerMap = new Map();
		const channelPeers = channel.getPeers();

		// bug in service discovery, peers don't have the associated mspid
		if (channelPeers.length > 0) {
			for (let channelPeer of channelPeers) {
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



	//TODO: cache the contract, keyed off the channelName+chaincodeId
	async getContract(channelName, chaincodeId) {
		const channel = this.client.getChannel(channelName);

		// initialize the channel if not initialized (initialize can use the peer map to
		// restrict the peers or to process in a specific order, currently it doesn't
		if (!this.channelStatus[channelName]) {
			await this._initializeChannel(channel);
			this.channelStatus[channelName] = {};
		}

		// build a peer map for the channel if not cached
		if (!this.channelStatus[channelName].peerMap) {
			this.channelStatus[channelName].peerMap = this._mapPeersToMSPid(channel);
		}

		// TODO: Should not use private var of User object (_mspId)
		const currentmspId = this.currentIdentity._mspId;

		// TODO: only required if submit notify is to be used
		// TODO: we need to filter down the event source peers based on roles, for now we will assume all in the peerMap are event sources
		// or assume the plugins do the work
		// create an event handler factory for the channel
		if (!this.channelStatus[channelName].eventHandlerFactory && this.eventHandlerFactory) {
			this.channelStatus[channelName].eventHandlerFactory =
				new this.eventHandlerFactory(
					channel,
					currentmspId,
					this.channelStatus[channelName].peerMap,
					this.options.eventHandlerOptions
				);
			await this.channelStatus[channelName].eventHandlerFactory.initialize();
		}

		// TODO: we need to filter down the queryable peers based on roles, for now we will assume all in the peerMap are chaincode queryable
		// or assume the plugins do the work
		// create a query handler for the channel.
		this.channelStatus[channelName].queryHandler =
			new this.queryHandlerClass(
				channel,
				currentmspId,
				this.channelStatus[channelName].peerMap,
				this.options.queryHandlerOptions
			);

		// Create the new Contract
		return new Contract(
			channel,
			chaincodeId,
			this.channelStatus[channelName].eventHandlerFactory,
			this.channelStatus[channelName].queryHandler,
			this
		);
	}
}


module.exports = Network;
