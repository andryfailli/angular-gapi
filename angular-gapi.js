// angular-gapi 
// https://github.com/andryfailli/angular-gapi
//
// Copyright 2016 Andrea Failli
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//    http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function() {

    angular
        .module("angular-gapi", []);

})();
(function() {

    AngularGapiConfig.$inject = ["GapiProvider"];
    angular
        .module("angular-gapi")
        .config(AngularGapiConfig);

    function AngularGapiConfig(GapiProvider) {

        window.ngGapiInit = function() {
            window.ngGapiInitSemaphore--;
            if (window.ngGapiInitSemaphore == 0)
                GapiProvider.setGapi(window.gapi);
        }

        function loadScript(id, src) {

            var prefix = "ngGapiScript_";

            if (!window.ngGapiInitSemaphore) window.ngGapiInitSemaphore = 0;

            if (!document.getElementById(prefix + id)) {

                window.ngGapiInitSemaphore++;

                var scriptElement = document.createElement("script");
                scriptElement.setAttribute("src", src + "?onload=ngGapiInit");
                scriptElement.setAttribute("id", prefix + id);
                var parentElement = document.getElementsByTagName("head")[0] || document.getElementsByTagName("body")[0];
                parentElement.appendChild(scriptElement);
            }

        }

        loadScript("jsapi", "https://apis.google.com/js/platform.js");
        loadScript("client", "https://apis.google.com/js/client:platform.js");

    }

})();
(function() {

    GapiPickerService.$inject = ["$q", "Gapi"];
    angular
        .module("angular-gapi")
        .service('GapiPicker', GapiPickerService);

    function GapiPickerService($q, Gapi) {
        return {
            create: function() {

                var pickerBuilderDeferred = $q.defer();
                $q.all([Gapi.load("picker"), Gapi.auth$promise()]).then(function() {

                    var pickerBuilder = new google.picker.PickerBuilder()
                        .setOAuthToken(Gapi.token())
                        .setDeveloperKey(Gapi.apiKey());

                    pickerBuilderDeferred.resolve(pickerBuilder);
                });

                return pickerBuilderDeferred.promise;

            }
        };
    };

})();
(function() {

    GapiResourceFactory.$inject = ["Gapi", "$q"];
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

                    var reqPath = config.resourceType ? config.resourceType.toLowerCase() + "." + reqMethod : reqMethod;

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
                    var reqPath = config.resourceType ? config.resourceType.toLowerCase() + "." + method : method
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
(function() {

    angular
        .module("angular-gapi")
        .provider('Gapi', GapiProvider);

    function GapiProvider() {

        var _$q = angular.injector(['ng']).get('$q');
        var _$injector = angular.injector(['ng']).get('$injector');

        var gapi;
        var clientId;
        var apiKey;
        var scope;
        var token;

        var libPromises = {};
        var clientPromises = {};
        var clients = {};

        var gapiDeferred = _$q.defer();
        var authDeferred = null;

        var cache = null;

        var interceptors = [];

        function setGapi(value) {
            gapi = value;
            gapiDeferred.resolve(gapi);
        };

        function setClientId(value) {
            clientId = value;
        };

        function setApiKey(value) {
            apiKey = value;
        };

        function setScope(value) {
            scope = value;
        };

        function setCache(value) {
            cache = value;
        };

        function load(name) {

            if (!libPromises[name]) {
                var libDeferred = _$q.defer();
                libPromises[name] = libDeferred.promise;

                gapiDeferred.promise.then(function() {
                    gapi.load(name, {
                        callback: function() {
                            libDeferred.resolve(name);
                        }
                    });
                });
            }

            return libPromises[name];

        };

        function loadClient(name, version, root) {

            if (!clientPromises[name]) {
                var clientDeferred = _$q.defer();
                clientPromises[name] = clientDeferred.promise;

                clients[name] = buildClientDraft(name);

                gapiDeferred.promise.then(function() {
                    gapi.client.load(name, version, function() {
                        clients[name] = angular.extend(clients[name], gapi.client[name]);
                        clientDeferred.resolve(clients[name]);
                    }, root);
                });
            }

            return clientPromises[name];

        };

        function authorize(immediate) {
            authDeferred = _$q.defer();

            var currentAuthTryDeferred = _$q.defer();

            gapiDeferred.promise.then(function() {

                var params = {
                    client_id: clientId,
                    scope: typeof scope === "object" ? scope.join(" ") : scope,
                    cookiepolicy: 'single_host_origin',
                    immediate: immediate
                }

                gapi.auth.authorize(params, function(response) {
                    if (response && response.error) {
                        currentAuthTryDeferred.reject(response.error);
                    } else {
                        token = response.access_token;
                        currentAuthTryDeferred.resolve(response);
                        authDeferred.resolve(response);
                    }

                });

            });

            return currentAuthTryDeferred.promise;
        };

        function logout() {
            if (authDeferred) {
                gapi.auth.signOut();
                authDeferred.reject('logout');
                authDeferred = null;
            }
        }

        function traverse(o, path) {
            var pieces = path.split(".");
            for (var i = 0; i < pieces.length; i++) {
                if (!angular.isObject(o)) return;
                o = o[pieces[i]];
            }
            return o;
        }

        function truncate(o, master) {
            for (var key in o) {
                if (key[0] != "$") {
                    if (typeof master[key] == "undefined") {
                        delete o[key];
                    } else {
                        if (angular.isObject(o[key])) truncate(o[key], master[key]);
                    }
                }
            }
        }

        function clearJSON(o) {
            if (angular.isObject(o))
                for (var key in o) {
                    if (key[0] == "$") {
                        delete o[key];
                    } else {
                        if (angular.isObject(o[key])) clearJSON(o[key]);
                    }
                }
        }

        function applyInterceptors(interceptorType, payload) {
            for (var i = 0; i < interceptors.length; i++) {
                var interceptor = angular.isString(interceptors[i]) ? _$injector.get(interceptors[i]) : interceptors[i];
                payload = interceptor[interceptorType](payload);
            }
            return payload;
        }

        function exec(clientName, methodName, request, resource) {

            request = applyInterceptors("request", request);

            request = angular.copy(request);
            clearJSON(request);

            var execDeferred = _$q.defer();

            var execResultDraft = buildClientExecResultDraft(execDeferred.promise, resource);

            var execResultCacheKey = clientName + "." + methodName + "(" + angular.toJson(request) + ")";
            if (cache) {
                var cachedExecResult = cache.get(execResultCacheKey);
                if (cachedExecResult) {
                    angular.extend(execResultDraft, cachedExecResult);
                }
            }

            var previous$resolved = execResultDraft.$resolved;
            execResultDraft.$resolved = false;
            execResultDraft.$resolving = true;

            execDeferred.promise
                .then(function(result) {
                    if (cache) cache.put(execResultCacheKey, result);

                    truncate(execResultDraft, result);
                    angular.extend(execResultDraft, result);

                    execResultDraft.$resolved = true;
                    execResultDraft.$resolving = false;

                }).catch(function() {
                execResultDraft.$resolved = angular.isDefined(previous$resolved) ? previous$resolved : false;
                execResultDraft.$resolving = false;
            });

            _$q.all(authDeferred ? [authDeferred.promise, clientPromises[clientName]] : [clientPromises[clientName]]).then(function() {

                var client = clients[clientName];
                var method = traverse(client, methodName);

                method(request).execute(function(response) {

                    response = applyInterceptors("response", response);

                    if (response && response.error)
                        execDeferred.reject(response.error);
                    else
                        execDeferred.resolve(response.result);
                });

            });

            return execResultDraft;
        }

        function buildClientDraft(name) {
            return {
                promise: clientPromises[name],
                exec: function(method, payload, resource) {
                    return exec(name, method, payload, resource);
                }
            }
        }

        function buildClientExecResultDraft(promise, resource) {
            return angular.extend(angular.isObject(resource) ? resource : {}, {
                $promise: promise,
                $resolved: false,
                $resolving: false
            });
        }

        this.setGapi = setGapi;
        this.setClientId = setClientId;
        this.setApiKey = setApiKey;
        this.setScope = setScope;
        this.setCache = setCache;
        this.load = load;
        this.loadClient = loadClient;
        this.interceptors = interceptors;

        this.$get = ["$q", "$injector", function GapiFactory($q, $injector) {

            _$q = $q;
            _$injector = $injector;

            return {
                gapi: function() {
                    return gapi;
                },
                gapi$promise: function() {
                    return gapiDeferred.promise
                },
                auth$promise: function() {
                    return authDeferred ? authDeferred.promise : null
                },
                token: function() {
                    return token;
                },
                clientId: function() {
                    return clientId;
                },
                apiKey: function() {
                    return apiKey;
                },
                setCache: function(_cache) {
                    return setCache(_cache);
                },
                load: function(name) {
                    return load(name);
                },
                loadClient: function(name, version, root) {
                    return loadClient(name, version, root);
                },
                client: function(name) {
                    return clients[name];
                },
                authorize: function(silent) {
                    return authorize(silent);
                },
                logout: function() {
                    return logout();
                }
            };
        }];

    };

})();