import InterfaceBlockchainBlockValidation from "common/blockchain/interface-blockchain/blocks/validation/Interface-Blockchain-Block-Validation"
import consts from "consts/const_global";

const CLEAR_OLD_UNUSED_BLOCKS_INTERVAL = 30*1000;
const CLEAR_OLD_UNUSED_BLOCKS = 5*60*1000;
const MAX_BLOCKS_MEMORY = 1000;

class LoadingManager{

    constructor(blockchain, savingManager){

        this.blockchain = blockchain;
        this.savingManager = savingManager;

        this.loadedBlocks = {};
        this.loadedBlocksCount = 0;

        this._intervalClearOldUnsuedBlocks = setTimeout( this._clearOldUnusedBlocks.bind(this), CLEAR_OLD_UNUSED_BLOCKS_INTERVAL );

    }

    async getBlockDifficulty(height){
        return this.blockchain.db.get("blockDiff"+height);
    }

    async getBlockWork(height){
        let prevDifficulty = await this.getBlockDifficulty(height );
        return consts.BLOCKCHAIN.BLOCKS_MAX_TARGET_BIG_INTEGER.divide( new BigInteger( prevDifficulty.toString("hex"), 16 ) );
    }

    async getBlock(height){

        if ( this.savingManager._pendingBlocksList[height] )
            return this.savingManager._pendingBlocksList[height][0].block;

        if (height >= this.blockchain.blocks.length)
            throw {message: "getBlock  invalid height", height: height};

        if (this.loadedBlocks[height]){

            this.loadedBlocks[height].lastTimeUsed = new Date().getTime();
            return this.loadedBlocks[height];

        }else
            return this._loadBlock(height);

    }

    async _loadBlock(height){

        try {
            let block = await this.blockchain.blockCreator.createEmptyBlock( height );

            block.difficultyTargetPrev = this.getBlockDifficulty(height);
            block.difficultyTarget = this.getBlockDifficulty(height+1);

            if (await block.loadBlock() === false)
                throw {message: "no block to load was found"};

            this.addBlockToLoaded(height, block);

            return block;

        } catch (exception){

            console.error("Loading Manager raised an exception", exception);

        }

        return null;

    }

    addBlockToLoaded(height, block){

        block.lastTimeUsed = new Date().getTime();
        this.loadedBlocks[height] = block;

    }

    _clearOldUnusedBlocks(){

        let date = new Date().getTime();

        for (let key in this.loadedBlocks)
            if ( date - this.loadedBlocks[key].lastTimeUsed > CLEAR_OLD_UNUSED_BLOCKS) {

                //check if it is not 11being saved by the Save Manager
                delete this.loadedBlocks[key];
                this.loadedBlocksCount--;

            }

        if (this.loadedBlocksCount > MAX_BLOCKS_MEMORY){

            let array = Object.values(this.loadedBlocks);
            array.sort(function(a, b) {
                return a.lastTimeUsed - b.lastTimeUsed;
            });

            for (let i=MAX_BLOCKS_MEMORY; i < array.length; i++)
                delete this.loadedBlocks[ array[i].height ];

            this.loadedBlocksCount = MAX_BLOCKS_MEMORY;

        }

        this._intervalClearOldUnsuedBlocks = setTimeout( this._clearOldUnusedBlocks.bind(this), CLEAR_OLD_UNUSED_BLOCKS_INTERVAL );

    }

}

export default LoadingManager;