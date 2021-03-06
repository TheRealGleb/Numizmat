
var User       = require('../../models/user');
var Auction    = require('../../models/auction');
var Lot        = require('../../models/lot');
var Settings   = require('../../models/settings');
var Category   = require('../../models/category');
var async      = require('async');

module.exports = function(express) {

	var apiRouter = express.Router();

    apiRouter.get('/auctionIsExist', function(req, res) {
        Auction.find({}).populate('lots').exec(function(err, auctions) {
            var current = auctions.filter(function(auc) {
                return auc.status != "archived"
            })

            if (current.length > 0) {
                res.json({
                    auction: current[0]
                })
            } else if (current.length == 0) {
                res.json({
                    success: true
                })
            }
        })
    })

    apiRouter.get('/isSuperAdmin/:id', function(req, res) {
        User.findById(req.params.id, function(err, user) {
            if(user.super) {
                res.json({
                    success: true
                })
            } else {
                res.json({
                    success: false
                })
            }
        })
    })

    apiRouter.post('/createAuction', function(req, res) {
        Auction.findOne({name: req.body.name}, function(err, auction) {
            if(auction) {
                if(auction.status != "archived") {
                    res.json({
                        success: false,
                        message: "This auction already exist!"
                    })
                } else if (auction.status == "archived") {
                    var auc = new Auction({
                        name: req.body.name,
                        timeToStart: req.body.timeToStart,
                        status: "new"
                    });
                    auc.save(function(err) {
                        res.json({
                            success: true,
                            message: "Auction was created!"
                        })
                    })
                }  
            } else if(!auction) {
                var auc = new Auction({
                    name: req.body.name,
                    timeToStart: req.body.timeToStart,
                    status: "new"
                })
                auc.save(function(err) {
                    res.json({
                        success: true,
                        message: "Auction was created!",
                    })
                })
            }
        })
    })

    apiRouter.put('/updateAuction', function(req, res) {
        var lotsToSave = [];
        req.body.lots.forEach(function(item) {
            lotsToSave.push(function(callback) {
                Lot.findById(item._id, function(err, lot) {
                    lot.startTrading = item.startTrading;
                    lot.endTrading = item.endTrading;
                    lot.save(function(err){
                        callback(null, lot)
                    })
                })
            })     
        })
        async.parallel(lotsToSave, function(err, results) {
            Auction.findById(req.body.id, function(err, auction) {
                auction.name = req.body.name;
                auction.timeToStart = req.body.timeToStart;
                auction.save(function(err) {
                    res.json(req.body)
                })
            }) 
        })      
    })

    apiRouter.put('/updateAuctionStatus', function(req, res) {
        Auction.findById(req.body.id).populate('lots').exec(function(err, auction) {
            auction.status = req.body.status;
            auction.save(function(err, savedAuction) {
                var workingLots = [];
                var counter = 0;

                function sortByYear (a, b) {
                    if (a.year.era == 'new' && b.year.era == 'old') return 1;
                    if (a.year.era == 'old' && b.year.era == 'new') return -1;
                    if (a.year.era == 'old' && b.year.era == 'old') {
                        if (a.year.value < b.year.value) return 1;
                        if (a.year.value > b.year.value) return -1;
                    }
                    if (a.year.era == 'new' && b.year.era == 'new') {
                        if (a.year.value < b.year.value) return -1;
                        if (a.year.value > b.year.value) return 1;
                    }
                }

                Category.find({}, function(err, categories) {
                    var countingInCategory = [];
                    categories.forEach(function(category) {
                        countingInCategory.push(function(cb) {
                            var countingInSubcategory = [];
                            category.subcats.forEach(function(subcat) {
                                countingInSubcategory.push(function(callback) {
                                    workingLots = auction.lots.filter(function(el) {
                                        return el.category == category.name && el.subcategory == subcat
                                    })

                                    workingLots = workingLots.sort(sortByYear)

                                    var createNumberOfLot = []
                                    workingLots.forEach(function(lot) {
                                        createNumberOfLot.push(function(callb){
                                            counter ++
                                            lot.number = counter;
                                            lot.save(function(err, savedLot){
                                                callb(null, savedLot)
                                            })
                                        })  
                                    })
                                    async.series(createNumberOfLot, function(err, rslts) {
                                        callback(null, rslts)
                                    })
                                })
                            })
                            async.series(countingInSubcategory, function(err, reslts) {
                                cb(null, reslts)
                            })
                        })                           
                    })
                    async.series(countingInCategory, function(err, results) {
                        Auction.findById(req.body.id).populate('lots').exec(function(err, auc) {
                            function sortByNumber(a, b) {
                                if( a.number > b.number) return 1;
                                if(a.number < b.number) return -1;
                            }
                            auc.lots = auc.lots.sort(sortByNumber);
                            Settings.findOne({}, function(err, settings) {
                                var recountTradingTime = [];
                                auc.lots.forEach(function(item, i) {
                                    recountTradingTime.push(function(cllbck) {
                                        item.startTrading = Number(auc.timeToStart) + (i * settings.tradingLot);
                                        item.endTrading = Number(item.startTrading) + settings.tradingLot;
                                        item.save(function(err, savedLot) {
                                            cllbck(null, savedLot)
                                        })
                                    });   
                                });
                                async.parallel(recountTradingTime, function(err, results) {
                                    res.json(results)
                                }); 
                            })
                        });  
                    })
                })
            })     
        })
    })

    apiRouter.delete('/removeAuction/:auction_id', function(req, res) {
        Auction.findByIdAndRemove(req.params.auction_id, function(err) {
            res.json({success: true})
        })
    })
    
    apiRouter.post('/saveSettings', function(req, res) {
        Settings.findOne({}, function(err, settings) {
            if(!settings) {
                var sets = new Settings({
                    tradingLot: req.body.tradingLot,
                    prolongTime: req.body.prolongTime,
                    betSteps: {
                        fromNull: req.body.fromNull,
                        fromOneMile: req.body.fromOneMile,
                        fromTwoMile: req.body.fromTwoMile,
                        fromFiveMile: req.body.fromFiveMile,
                        fromTenMile: req.body.fromTenMile,
                        fromTwentyMile: req.body.fromTwentyMile,
                        fromFiftyMile: req.body.fromFiftyMile,
                        fromOneHundredMile: req.body.fromOneHundredMile,
                        fromTwoHundredMile: req.body.fromTwoHundredMile,
                        fromFiveHundredMile: req.body.fromFiveHundredMile
                    }
                })

                sets.save(function(err) {
                    res.json({success: true, message: "Settings saved!"})
                })
            } else if(settings) {
                settings.tradingLot = req.body.tradingLot;
                settings.prolongTime = req.body.prolongTime;
                settings.betSteps.fromNull = req.body.betSteps.fromNull;
                settings.betSteps.fromOneMile = req.body.betSteps.fromOneMile;
                settings.betSteps.fromTwoMile = req.body.betSteps.fromTwoMile;
                settings.betSteps.fromFiveMile = req.body.betSteps.fromFiveMile;
                settings.betSteps.fromTenMile = req.body.betSteps.fromTenMile;
                settings.betSteps.fromTwentyMile = req.body.betSteps.fromTwentyMile;
                settings.betSteps.fromFiftyMile = req.body.betSteps.fromFiftyMile;
                settings.betSteps.fromOneHundredMile = req.body.betSteps.fromOneHundredMile;
                settings.betSteps.fromTwoHundredMile = req.body.betSteps.fromTwoHundredMile;
                settings.betSteps.fromFiveHundredMile = req.body.betSteps.fromFiveHundredMile;

                settings.save(function(err) {
                    res.json({success: true, message: "Settings saved!"})
                })
            }
        })
    })

    apiRouter.get('/updateAuctionStatus/:auction_id', function(req, res) {
        Auction.findById(req.params.auction_id, function(err, auction) {
            auction.status = 'archived'
            auction.save(function(err) {
                res.json({success: true})
            })
        })
    })

    apiRouter.get('/archiveAuctions', function(req, res) {
        Auction.find({status: 'archived'}).populate('lots').exec(function( err, auctions) {
            res.json(auctions)
        })
    })

    return apiRouter
}