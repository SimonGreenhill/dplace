angular.module('dplaceServices', ['ngResource'])
    .factory('LanguageClass', function ($resource) {
        return $resource(
            '/api/v1/language_classes/:id',
            {page_size: 1000}, {
                query: {
                    method: 'GET',
                    isArray: true,
                    transformResponse: function(data, headers) {
                        return JSON.parse(data).results;
                    }
                }
            });
    });