import InterfaceSatoshminDB from 'common/satoshmindb/Interface-SatoshminDB';
import consts from 'consts/const_global';
import WebDollarCrypto from "../../../crypto/WebDollar-Crypto";
import ed25519 from "common/crypto/ed25519";

import Utils from "common/utils/helpers/Utils";
import PoolsUtils from "common/mining-pools/common/Pools-Utils"
import Blockchain from "main-blockchain/Blockchain";
import ed25519 from "common/crypto/ed25519";
import StatusEvents from "common/events/Status-Events";

class PoolSettings {

    constructor(wallet, poolManagement, databaseName){

        this.poolManagement = poolManagement;
        this._wallet = wallet;
        this._db = new InterfaceSatoshminDB( databaseName ? databaseName : consts.DATABASE_NAMES.POOL_DATABASE );

        this._poolFee = 0.02;
        this._poolName = '';
        this._poolWebsite = '';
        this._poolServers = '';
        this._poolPOWValidationProbability = 0.10; //from 100

        this._poolPrivateKey = WebDollarCrypto.getBufferRandomValues(64);
        this.poolPublicKey = undefined;

        this.poolURL = '';

        //TODO: this stores the entire reward of pool(miners + poolLeader), this goes to Accountant Tree
        this._poolRewardsAddress = null;

        //TODO: this stores pool leader's reward, this goes to Accountant Tree
        this._poolLeaderRewardAddress = null;

    }

    async initializePoolSettings(poolFee){

        let result = await this._getPoolPrivateKey();

        result = result && await this._getPoolDetails();

        if (poolFee !== undefined)
            this.setPoolFee(poolFee);

        if (result)
            this.poolManagement.poolInitialized = true;

        return result;

    }

    _generatePoolURL(){

        if (this._poolName === '' || this._poolFee === 0 ){
            this.poolURL = '';
            return '';
        }

        let servers = this.poolServers.join(";");
        servers = servers.replace(/\//g, '@' );

        let website = this.poolWebsite.replace(/\//g, '@' );

        this.poolURL =  ( consts.DEBUG? 'http://webdollar.ddns.net:9094' : 'https://webdollar.io') +'/pool/'+encodeURI(this._poolName)+"/"+encodeURI(this.poolFee)+"/"+encodeURI(this.poolPublicKey.toString("hex"))+"/"+encodeURI(website)+"/"+encodeURI(servers);

        return this.poolURL;

    }


    get poolName(){

        return this._poolName;
    }

    setPoolName(newValue){

        this._poolName = newValue;

        return this.savePoolDetails();
    }

    get poolWebsite(){

        return this._poolWebsite;
    }

    setPoolWebsite(newValue){

        this._poolWebsite = newValue;

        return this.savePoolDetails();
    }

    get poolPrivateKey(){

        return this._poolPrivateKey;
    }

    get poolFee(){

        return this._poolFee;
    }

    get poolPOWValidationProbability(){
        return this._poolPOWValidationProbability;
    }

    setPoolFee(newValue){

        this._poolFee = newValue;

        return this.savePoolDetails();
    }

    get poolServers(){

        return this._poolServers;

    }

    getPoolServersText(){
        if (typeof this._poolServers === "string" ) return this._poolServers;

        return PoolsUtils.convertServersList(this._poolServers);
    }

    setPoolServers(newValue){

        this._poolServers = newValue;
        return this.savePoolDetails();

    }

    async savePoolPrivateKey(){

        let result = await this._db.save("pool_privateKey", this._poolPrivateKey);

        return result;

    }

    async _getPoolPrivateKey(){

        this._poolPrivateKey = await this._db.get("pool_privateKey", 30*1000, true);

        if (this._poolPrivateKey === null) {

            let privateKey = await Blockchain.Wallet.addresses[0].getPrivateKey();
            let finalPrivateKey = Buffer.concat( [ WebDollarCrypto.SHA256(WebDollarCrypto.MD5(privateKey)), WebDollarCrypto.SHA256( WebDollarCrypto.RIPEMD160(privateKey) )]);

            this._poolPrivateKey = ed25519.generatePrivateKey(finalPrivateKey);

        }

        if (Buffer.isBuffer(this._poolPrivateKey)){
            this.poolPublicKey = ed25519.generatePublicKey(this._poolPrivateKey);
        } else
            throw {message: "poolPrivateKey is wrong"}

        return true;
    }

    async justValidatePoolDetails(poolName, poolFee, poolWebsite, poolServers){

        return PoolsUtils.validatePoolsDetails(poolName, poolFee, poolWebsite, this.poolPublicKey, poolServers);

    }

    async validatePoolDetails(){

        if (!PoolsUtils.validatePoolsDetails(this._poolName, this._poolFee, this._poolWebsite, this.poolPublicKey, this._poolServers))
            throw {message: "poolData is invalid"};

        this._poolServers = PoolsUtils.processServersList( this.poolServers );

        await this.poolManagement.poolProtocol.poolConnectedServersProtocol.insertServersListWaitlist( this._poolServers );

        this._generatePoolURL();

        if ( this.poolURL !== ''){ //start automatically
            await this.poolManagement.startPool();
        }

        return true;

    }

    async savePoolDetails(){

        await this.validatePoolDetails();

        let result = await this._db.save("pool_name", this._poolName);
        result = result && await this._db.save("pool_fee", this._poolFee);
        result = result  && await this._db.save("pool_website", this._poolWebsite);
        result = result  && await this._db.save("pool_servers", JSON.stringify(this._poolServers));

        StatusEvents.emit("pools/settings", { message: "Pool Settings were saved", poolName: this._poolName, poolServer: this._poolServers, poolFee: this._poolFee, poolWebsite: this._poolServers });

        return  result;
    }

    async _getPoolDetails(){

        this._poolName = await this._db.get("pool_name", 30*1000, true);
        if (this._poolName === null) this._poolName = '';

        try {

            this._poolFee = await this._db.get("pool_fee", 30 * 1000, true);
            if (this._poolFee === null)
                this._poolFee = 0.02;

            this._poolFee = parseFloat(this._poolFee);
        } catch (exception){

        }

        this._poolWebsite = await this._db.get("pool_website", 30*1000, true);
        if (this._poolWebsite === null) this._poolWebsite = '';

        this._poolServers = JSON.parse( await this._db.get("pool_servers", 30*1000, true) );
        if (this._poolServers === null) this._poolServers = '';

        return await this.validatePoolDetails();

    }

    poolDigitalSign(message){

        let signature = ed25519.sign( message, this._poolPrivateKey );
        return signature;

    }

}

export default PoolSettings;