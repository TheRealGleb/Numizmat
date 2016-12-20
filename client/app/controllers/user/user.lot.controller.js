(function() {
	'use strict';

	angular
		.module('numizmat')
		.controller('LotController', ['$interval', '$timeout', '$location', '$rootScope', '$scope', '$http', '$stateParams', '$window', 'Lightbox', 'socket', '$uibModal', function ($interval, $timeout, $location, $rootScope, $scope, $http, $stateParams, $window, Lightbox, socket, $uibModal) {
			moment.locale('ru')
			var vm = this;
			var deltaBet = undefined;
			var deltaTime = undefined;
			var settings = {};
			var redirect = undefined;

			vm.ownBet = false;
			vm.bet = undefined;
			vm.minBet = undefined;
			vm.lot = {};
			vm.imgUrls = [];
			vm.endToTrade = undefined;
			vm.available = true;
			vm.prevId = undefined;
			vm.nextId = undefined;
			vm.autobet = undefined;
			vm.autobetTemplate = "autobetPopover.html"

			if(!$rootScope.loggedIn) {
				vm.errorMessage = "Только авторизованные пользователи могут делать ставки. Пожалуйста, авторизуйтесь."
			} else if($rootScope.loggedIn) {
				$http.get('/api/user/' + $window.localStorage.getItem('id')).then(function(resolve) {
					if(!resolve.data.active) {
						vm.errorMessage = "Только активированные пользователи могут делать ставки. Пожалуйста, активируйте свой аккаунт."
					}
				})
			}

			$http.get('/api/getSettings').then(function(resolve) {
				settings = resolve.data
				deltaTime = settings.prolongTime;
				return $http.get('api/lot/' + $stateParams.lot_id)
			}).then(function(resolve) {
				vm.lot = resolve.data.current;
				console.log(vm.lot)
				vm.prevId = resolve.data.prev_id;
				vm.nextId = resolve.data.next_id;
				if(vm.lot.customer == $window.localStorage.getItem('id')) {
					vm.ownBet = true;
				}
				resolve.data.current.imgIds.forEach(function(el) {
					var url = "http://res.cloudinary.com/dsimmrwjb/image/upload/" + el + ".png"
					vm.imgUrls.push(url)
				});
				checkBetStep();
				checkTime();
				vm.autobet = vm.lot.price + deltaBet;
				if (Date.now() < Number(vm.lot.endTrading)) 
					redirect = $interval(checkRedirect, 1000);
			});

			function checkBetStep () {
				if (vm.lot.price < 1000)
					deltaBet = settings.betSteps.fromNull;
				else if (vm.lot.price >= 1000 && vm.lot.price < 2000)
					deltaBet = settings.betSteps.fromOneMile;
				else if (vm.lot.price >= 2000 && vm.lot.price < 5000)
					deltaBet = settings.betSteps.fromTwoMile;
				else if (vm.lot.price >= 5000 && vm.lot.price < 10000)
					deltaBet = settings.betSteps.fromFiveMile;
				else if (vm.lot.price >= 10000 && vm.lot.price < 20000)
					deltaBet = settings.betSteps.fromTenMile;
				else if (vm.lot.price >= 20000 && vm.lot.price < 50000)
					deltaBet = settings.betSteps.fromTwentyMile;
				else if (vm.lot.price >= 50000 && vm.lot.price < 100000)
					deltaBet = settings.betSteps.fromFiftyMile;
				else if (vm.lot.price >= 100000 && vm.lot.price < 200000)
					deltaBet = settings.betSteps.fromOneHundredMile;
				else if (vm.lot.price >= 200000 && vm.lot.price < 500000)
					deltaBet = settings.betSteps.fromTwoHundredMile;
				else if (vm.lot.price >= 500000)
					deltaBet = settings.betSteps.fromFiveHundredMile;
				vm.bet = vm.lot.price + deltaBet;
				vm.minBet = vm.lot.price + deltaBet;
			}

			function checkTime () {
				if (Date.now() < Number(vm.lot.endTrading)) {
					if(Math.floor((vm.lot.endTrading - Date.now()) / 1000) > 60)
						vm.endToTrade = moment(new Date(Number(vm.lot.endTrading))).fromNow();
					else 
						vm.endToTrade = "Через " + Math.floor((vm.lot.endTrading - Date.now()) / 1000) + " секунд"
				} else if (Date.now() > Number(vm.lot.endTrading)) {
					vm.endToTrade = "Торги завершены";
					vm.available = false;
					$interval.cancel(interval)
				}
			}

			function checkRedirect () {
				if (Date.now() >= Number(vm.lot.endTrading)) {
					$interval.cancel(redirect)
					$timeout(function() {
						$location.path('/lot/'+vm.nextId)
					}, 1500)
				}
			}

			var interval = $interval(checkTime, 1000);
			
			vm.openLightboxModal = function (index) {
			    Lightbox.openModal(vm.imgUrls, index);
			};

			vm.makeBet = function() {
				var currentDelta = Number(vm.lot.endTrading) - Date.now()
				socket.emit('bet up', {
					price: vm.bet,
					user_id: $window.localStorage.getItem('id'),
					user_email: $window.localStorage.getItem('user'),
					lot: vm.lot,
					tradingLot: settings.tradingLot,
					deltaTime: deltaTime,
					currentDelta: currentDelta,
					time: moment().format('LLL')
				})
			}

			vm.viewHistory = function (lot) {

				var modalInstance = $uibModal.open({
			      	ariaLabelledBy: 'modal-title',
			      	ariaDescribedBy: 'modal-body',
			      	templateUrl: 'lotHistory.html',
			      	controller: 'HistoryModalCtrl',
			      	controllerAs: 'modal',
			      	resolve: {
			        	lot: function () {
			          		return lot;
			        	}
			      	}
			    });
			}

			vm.saveAutobet = function() {
				console.log("deltaBet:", deltaBet)
				console.log("vm.lot.autobets:", vm.lot.autobets)
				var existCustomer = vm.lot.autobets.filter(function(el) {
					return el.customer == $window.localStorage.getItem('id')
				})
				console.log("existCustomer:", existCustomer)
				if (existCustomer.length == 0) {
					vm.lot.autobets.push({
						customer: $window.localStorage.getItem('id'),
						price: vm.autobet
					})
				} else {
					var arrIndex = vm.lot.autobets.findIndex(function(el) {
						return el.customer == $window.localStorage.getItem('id')
					})
					vm.lot.autobets[arrIndex].price = vm.autobet
					console.log("arrIndex: ", arrIndex)
				}
				console.log("vm.lot.autobets:", vm.lot.autobets)
				console.log("vm.lot:", vm.lot)
				// vm.lot.autobets.forEach(function(autobet) {
				// 	if( (autobet.price - vm.lot.price) > deltaBet) {

				// 	}
				// })
			}

			function lotUpdate (data) {
				if(data[0]._id != $stateParams.lot_id) {
					return
				} else {
					vm.lot = data[0];
					if(vm.lot.customer == $window.localStorage.getItem('id'))
						vm.ownBet = true;
					else
						vm.ownBet = false;
					checkBetStep();
					$scope.$apply();
				}
			}

			function timeUpdate (data) {
				data.forEach(function(item) {
					if(item._id == $stateParams.lot_id) {
						vm.lot = item;
						if(vm.lot.customer == $window.localStorage.getItem('id'))
							vm.ownBet = true;
						else
							vm.ownBet = false;
						checkBetStep();
					}
				})
				$scope.$apply();
			}

			function recountingLot (data) {
				data.forEach(function(lot) {
					if(lot._id == $stateParams.lot_id) {
						vm.lot.startTrading = lot.startTrading;
						vm.lot.endTrading = lot.endTrading;
						checkTime();
						$scope.$apply();
					}
				})
			}

			function changeSets (data) {
				settings = data;
				deltaTime = settings.prolongTime;
				checkBetStep();
				$scope.$apply();
			}

			socket.on('lot update', lotUpdate)
			socket.on('trading time changed', timeUpdate)
			socket.on('recounting lots', recountingLot)
			socket.on('settings changed', changeSets)

			$scope.$on('$destroy', function() {
				socket.off('lot update', lotUpdate)
				socket.off('trading time changed', timeUpdate)
				socket.off('recounting lots', recountingLot)
				socket.off('settings changed', changeSets)
				$interval.cancel(interval)
				$interval.cancel(redirect)
			})

		}]);

})();