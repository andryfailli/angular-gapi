(function() {

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