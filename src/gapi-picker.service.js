(function() {

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