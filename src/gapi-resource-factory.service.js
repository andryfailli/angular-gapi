(function() {

    angular
        .module("angular-gapi")
        .service("GapiResourceFactory", GapiResourceFactory);

    function GapiResourceFactory(Gapi, $q) {

        return function(config) {

            var client = Gapi.client(config.clientName);

            function execList(reqMethod, reqPayload, list) {

                var list = list ? list : [];

                list.splice(0, list.length);

                list.$nextPageToken = reqPayload ? reqPayload.nextPageToken : null;
                list.$limit = reqPayload ? reqPayload.limit : null;

                list.$next = function() {

                    var reqPayloadPaged = angular.extend(reqPayload ? reqPayload : {}, {});
                    reqPayloadPaged[config.pageTokenFieldName] = list.$nextPageToken;
                    reqPayloadPaged[config.limitFieldName] = list.$limit;

                    var reqPath = (config.resourceType ? config.resourceType + "." + reqMethod : reqMethod).toLowerCase();

                    var response = client.exec(reqPath, reqPayloadPaged);
                    angular.extend(list, response);

                    var listDeferred = $q.defer();
                    list.$promise = listDeferred.promise;

                    var previous$resolved = list.$resolved;
                    list.$resolved = false;
                    list.$resolving = true;

                    response.$promise
                        .then(function() {
                            if (angular.isArray(response[config.itemsFiledName])) {
                                for (var i = 0; i < response[config.itemsFiledName].length; i++) {
                                    list.push(resourceConstructor(response[config.itemsFiledName][i]));
                                }
                            }
                            list.$nextPageToken = response[config.nextPageTokenFieldName];

                            list.$resolved = true;
                            list.$resolving = false;

                            listDeferred.resolve(list);

                        })
                        .catch(function(reason) {
                            list.$resolved = angular.isDefined(previous$resolved) ? previous$resolved : false;
                            list.$resolving = false;
                            listDeferred.reject(reason);
                        });

                    return list;

                };

                list.$exec = function(method, params) {
                    return execList(method, params, list);
                };

                list.$execList = function(method, params) {
                    return execList(method, params, list);
                };

                if (angular.isObject(config.resourcesListMethods)) {
                    for (var method in config.resourcesListMethods) {
                        list[method] = (function(method) {
                            return function() {
                                return config.resourcesListMethods[method].apply(list, arguments);
                            }
                        })(method);
                    }
                }

                return list.$next();
            }

            var resourceConstructor = function(data) {

                var resource = {};

                if (angular.isObject(data)) angular.extend(resource, data);

                resource.$exec = function(method, params) {
                    var reqPath = (config.resourceType ? config.resourceType + "." + method : method).toLowerCase();
                    return client.exec(reqPath, params, this);
                };

                if (angular.isObject(config.resourceMethods)) {
                    for (var method in config.resourceMethods) {
                        resource[method] = (function(method) {
                            return function() {
                                return config.resourceMethods[method].apply(resource, arguments);
                            }
                        })(method);
                    }
                }

                return resource;

            };

            resourceConstructor.$execList = function(method, params) {
                return execList(method, params);
            };

            resourceConstructor.$exec = function(method, params) {
                params = angular.isObject(params) ? params : {id: params};
                var resource = resourceConstructor(params);
                return resource.$exec(method, resource);
            };

            if (angular.isObject(config.resourceConstructorMethods)) {
                for (var method in config.resourceConstructorMethods) {
                    resourceConstructor[method] = (function(method) {
                        return function() {
                            return config.resourceConstructorMethods[method].apply(resourceConstructor, arguments);
                        }
                    })(method);
                }
            }

            resourceConstructor.$constructor = resourceConstructor;
            resourceConstructor.$resourceType = config.resourceType;

            return resourceConstructor;
        }
    }

})();