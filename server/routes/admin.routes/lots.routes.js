

var Auction    = require('../../models/auction');
var Category   = require('../../models/category');
var Lot        = require('../../models/lot');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var config     = require('../../../config');
var cloudinary = require('cloudinary');
var async      = require('async');
var fs         = require('fs');

cloudinary.config(config.cloudinaryConf);


module.exports = function(express) {

	var apiRouter = express.Router();

    apiRouter.get('/lot/:lot_id', function(req, res) {
        Lot.findById(req.params.lot_id, function(err, lot) {
            res.json({current: lot});
        });     
    })


	apiRouter.post('/addLot', multipartMiddleware, function(req, res) {
        var ImgsToUpload = [];
        req.files.photos.forEach(function (el) { 
            var path = el.path;
            ImgsToUpload.push(function(callback){ 
                cloudinary.uploader.upload(path, function(result){
                    callback(null, result.public_id);
                }, {quality: "auto"})
            })
        });
        async.parallel(ImgsToUpload, function(err, results) {
            var currentAuc = undefined;
            Auction.find({}, function(err, auctions) {
                var aucs = auctions.filter(function(auc) {
                    return auc.status != "archived"
                })
                currentAuc = aucs[0];
                var lot = new Lot();
                req.body.props.forEach(function(el){
                    lot.props.push({
                        name: el.name,
                        meta: el.meta,
                        value: el.currentValue
                    });
                });
                lot.year = {
                    value: req.body.year.value,
                    era: req.body.year.era
                },
                lot.auction = currentAuc._id;
                lot.name = req.body.name;
                lot.main_description = req.body.main_description;
                lot.imgIds = results;
                lot.top = req.body.top;
                lot.price = req.body.price;
                lot.category = req.body.category;
                lot.subcategory = req.body.subcategory;
                lot.bets = 0;

                lot.save(function(err, currentLot) {  
                    currentAuc.lots.push(currentLot);
                    currentAuc.save(function(err) {
                        res.json({ 
                            success: true,
                            message: 'Lot created!',
                            auction: currentAuc
                        });
                    });
                    req.files.photos.forEach(function (el) { 
                        var path = el.path;
                        fs.unlink(path);
                    });   
                });
            })     
        })          
    });

    apiRouter.post('/removeLot', function(req, res) {
        Lot.findByIdAndRemove(req.body.lot._id, function(err) {
            req.body.lot.imgIds.forEach(function(id) {
                cloudinary.uploader.destroy(id, function(result) {})
            })
        })
        Auction.findById(req.body.lot.auction, function(err, auction) {
            auction.lots.splice(auction.lots.indexOf(req.body.lot._id), 1)
            auction.save(function(err, savedAuc) {
                Auction.findById(req.body.lot.auction).populate('lots').exec(function(err, curAuction) {
                    res.json({
                        success: true,
                        lots: curAuction.lots
                    });
                });
            });
        });
    });

    apiRouter.post('/updateLot', multipartMiddleware, function(req, res) {
        if (Object.keys(req.files).length == 0) {

            Lot.findById(req.body.id, function(err, lot) {
                var arrToRemove = lot.imgIds.filter(function(value) {
                    return (req.body.imgIds.indexOf(value) == -1)
                })
                arrToRemove.forEach(function(el) {
                    cloudinary.uploader.destroy(el, function(result) {})
                })
                var props = [];
                lot.year = {
                    value: req.body.year.value,
                    era: req.body.year.era
                },
                lot.top = req.body.top;
                lot.name = req.body.name;
                lot.main_description = req.body.main_description;
                lot.availability = req.body.availability;
                lot.price = req.body.price;
                lot.imgIds = req.body.imgIds;
                lot.category = req.body.category;
                lot.subcategory = req.body.subcategory;
                req.body.props.forEach(function(el) {
                    props.push({
                        name: el.name,
                        meta: el.meta,
                        value: el.currentValue
                    });
                });
                lot.props = props;
                lot.save(function(err, currentLot) {  
                    res.json({ 
                        success: true,
                        message: 'Lot updated!'
                    });  
                });
            })

        } else {
            Lot.findById(req.body.id, function(err, lot) {
                var newIds = [];
                var imgToUpload = [];
                var arrToRemove = [];
                if(req.body.imgIds == 0) {
                    arrToRemove = lot.imgIds
                } else {
                    newIds = req.body.imgIds
                    arrToRemove = lot.imgIds.filter(function(value) {
                        return (req.body.imgIds.indexOf(value) == -1)
                    })
                }
                arrToRemove.forEach(function(el) {
                    cloudinary.uploader.destroy(el, function(result) {})
                })
                req.files.photos.forEach(function(el) {
                    var index = el.fieldName.slice(7,8);
                    imgToUpload.push(function(callback) { 
                        cloudinary.uploader.upload(el.path, function(result){
                            callback(null, {
                                id: result.public_id,
                                index: index
                            });
                        }, {quality: "auto"})
                    })
                })
                async.parallel(imgToUpload, function(err, results) {
                    var props = [];
                    results.forEach(function(el) {
                        if(newIds[el.index]) {
                            cloudinary.uploader.destroy(newIds[el.index], function(result) {})
                            newIds[el.index] = el.id;
                        } else if (!newIds[el.index]) {
                            newIds.push(el.id)
                        }
                    })
                    lot.year = {
                        value: req.body.year.value,
                        era: req.body.year.era
                    },
                    lot.top = req.body.top;
                    lot.name = req.body.name;
                    lot.main_description = req.body.main_description;
                    lot.availability = req.body.availability;
                    lot.price = req.body.price;
                    lot.imgIds = newIds;
                    lot.category = req.body.category;
                    lot.subcategory = req.body.subcategory;
                    req.body.props.forEach(function(el){
                        props.push({
                            name: el.name,
                            meta: el.meta,
                            value: el.currentValue
                        });
                    });
                    lot.props = props;
                    lot.save(function(err, currentLot) { 
                        req.files.photos.forEach(function (el) { 
                            var path = el.path;
                            fs.unlink(path)
                        }); 
                        res.json({ 
                            success: true,
                            message: 'Lot updated!'
                        });  
                    });
                })
            })  
        }
    });

    return apiRouter
}