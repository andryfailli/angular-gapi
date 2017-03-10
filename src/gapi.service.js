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

        this.$get = function GapiFactory($q, $injector) {

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
        };

    };

})();