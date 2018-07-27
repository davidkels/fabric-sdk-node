import {Channel, User, ChannelEventHub, TransactionId, ICryptoKey} from 'fabric-client';
import { EventEmitter } from 'events';
import Client = require('fabric-client');

// workaround as client isn't exported from fabric-client and it should be
//type Client = any;

declare namespace FabricNetwork {

	export interface InitOptions {
		commitTimeout?: number;
		eventHandlerFactory?: string;
		eventHandlerOptions?: any;
		queryHandler?: string;
		queryHandlerOptions?: any;
		useDiscovery?: boolean;
		discoveryOptions?: {
			discoveryProtocol: string;
			asLocalHost: boolean;
			discoveryRefresh: number;
		}
	}


	//-------------------------------------------
	// Main fabric network classes
	//-------------------------------------------
	export class Network {
		constructor();

		// is this how we want to initialise based on ccp or Client ?
		initialize(ccp: string | Client, options?: InitOptions): Promise<void>;
		setIdentity(newIdentity: string): Promise<void>;
		getCurrentIdentity(): User;
		getClient(): Client;
		getOptions(): InitOptions;
		getChannel(channelName: string): Promise<FabricNetwork.Channel>;
		cleanup(): void;
	}

	export class Channel {
		initialize(): Promise<void>;
		getInternalChannel(): Channel;
		getPeerMap(): Map<string, any>; // TODO: any is not right
		rediscover(): Promise<void>;
		getContract(chaincodeId: string): Contract;
		// array of mapped by mspid ?
		getEventHubs(): ChannelEventHub[];
		cleanup(): void;

	}

	export class Contract extends EventEmitter {
		query(transactionName: string, parameters: string[], txId?: TransactionId): Promise<Buffer>;
		submitTransaction(transactionName: string, parameters: string[], txId?: TransactionId): Promise<Buffer>;
	}

	//-------------------------------------------
	// Wallet Management
	//-------------------------------------------
	export interface Identity {
		type: string
	}

	export interface X509Identity extends Identity {
		certificate: string,
		privateKey?: string
	}

	export interface CryptoContent {
			signedCertPEM: string,
			privateKeyPEM?: string,
			privateKeyObj?: ICryptoKey
	}

	export interface WalletProvider {
		normalizeLabel(label: string): string;
		setupStateStore(client: Client, label: string): Promise<void>;
		setupKeyStore(client: Client, label: string): Promise<void>;
	}

	// TODO: only specific to X509, what about idemix ?
	export abstract class Wallet implements WalletProvider {
		//Wallet User
		import(label: string, mspId: string, certificate: string, privateKey?: string): Promise<void>;
		export(label: string): Promise<X509Identity>;
		abstract update(label: string, certificate: string, privateKey?: string): Promise<void>;
		abstract delete(label: string): Promise<void>;
		abstract list(): Promise<any>;  // Todo what should list provide ?
		abstract exists(label: string): Promise<boolean>;
		setKeyWalletMixin(walletMixin: WalletMixin): void;

		// WalletProvider
		normalizeLabel(label: string): string;
		abstract setupStateStore(client: Client, label: string): Promise<void>;
		abstract setupKeyStore(client: Client, label: string): Promise<void>;
	}

	export interface WalletMixin {
		setupKeyStore(client: Client, label: string): void;
		createCryptoContent(publicCert: string, privateKey: string): Promise<CryptoContent>;
		exportCryptoContent(user: User): X509Identity;
	}

	// Real usable Wallet implementations
	export class InMemoryWallet extends Wallet {
		update(label: string, certificate: string, privateKey?: string): Promise<void>;
		delete(label: string): Promise<void>;
		list(): Promise<any>;  // Todo what should list provide ?
		exists(label: string): Promise<boolean>;
		setupStateStore(client: Client, label: string): Promise<void>;
		setupKeyStore(client: Client, label: string): Promise<void>;
	}

	export class FileSystemWallet extends Wallet {
		constructor(path: string);
		update(label: string, certificate: string, privateKey?: string): Promise<void>;
		delete(label: string): Promise<void>;
		list(): Promise<any>;  // Todo what should list provide ?
		exists(label: string): Promise<boolean>;
		setupStateStore(client: Client, label: string): Promise<void>;
		setupKeyStore(client: Client, label: string): Promise<void>;
	}

	export class CouchDBWallet extends Wallet {
		constructor(options: any); // TODO: need to define the option format here
		update(label: string, certificate: string, privateKey?: string): Promise<void>;
		delete(label: string): Promise<void>;
		list(): Promise<any>;  // Todo what should list provide ?
		exists(label: string): Promise<boolean>;
		setupStateStore(client: Client, label: string): Promise<void>;
		setupKeyStore(client: Client, label: string): Promise<void>;
	}

	export class HSMWalletMixin implements WalletMixin {  // TODO: do we need to declare that it implements WalletMixin ?
		constructor(library: string, slot: number, pin: string, userType: string);
		setupKeyStore(client: Client, label: string): void;
		createCryptoContent(publicCert: string, privateKey: string): Promise<any>; // TODO: need a definition
		exportCryptoContent(user: User): any; // TODO: Need to define the return
	}

	//-------------------------------------------
	// Plugins
	//-------------------------------------------

	//-------------------------------------------
	// query handler plugin type definitions
	//-------------------------------------------
	export abstract class QueryHandler {
		constructor(channel: Channel, mspId: string, peerMap: Map<string, Client.Peer>, queryOptions: any);
		initialize(): Promise<void>;
		abstract queryChaincode(chaincodeId: string, functionName: string, params: string, txId: TransactionId): Promise<Buffer>;
		cleanup(): void;
	}


	// -------------------------------------
	// Event Handler plugin type definitions
	// -------------------------------------
	export abstract class EventHandlerFactory {
		constructor(channel: string, mspId: string, peerMap: Map<string, Client.Peer>, eventHandlerOptions: any);
		initalize(): Promise<void>;
		cleanup(): void;
		addEventHub(eventHub: ChannelEventHub): void;
		//TODO: need to consider how this should be returned
		getEventHubs(): ChannelEventHub[];
		setEventHubs(availableEventHubs: ChannelEventHub[]): void;
		checkEventHubs(): void;
		disconnectEventHubs(): void;
		abstract createTxEventHandler(txid: string): TxEventHandler;

		// chaincodeEventsEnabled(): boolean;
		//abstract createChaincodeEventHandler(chaincodeId: string, eventName: string): ChaincodeEventHandler;
		//abstract createBlockEventHandler(): BlockEventHandler;
	}

	export abstract class TxEventHandler {
		abstract startListening() : Promise<void>;
		abstract waitForEvents() : Promise<void>;
		abstract cancelListening(): void;
	}

	// real implementation definition, bit annoying to have to define
	// it twice, once for JS users and again for TS users
	export enum DefaultEventHandlerStrategies {
		MSPID_SCOPE_ALLFORTX = 'MSPID_SCOPE_ALLFORTX',
		MSPID_SCOPE_ANYFORTX = 'MSPID_SCOPE_ANYFORTX',
		CHANNEL_SCOPE_ALLFORTX = 'CHANNEL_SCOPE_ALLFORTX',
		CHANNEL_SCOPE_ANYFORTX = 'CHANNEL_SCOPE_ANYFORTX'
	}


}
