var elasticsearch = require('elasticsearch'),
    merge = require('lodash').merge,
    perPage = 20;

var client = new elasticsearch.Client({ host: process.env.ELASTICSEARCH_URL });

module.exports = function (request, reply) {

  // Redirect /search/foo to /search/?foo
  if (request.params && request.params.q) {
    return reply.redirect('/search?q='+request.params.q);
  }

  if (!request.query || !request.query.q) {
    return reply.redirect('/');
  }

  var page = Math.abs(parseInt(request.query.page, 10)) || 1;
  var searchQuery = {
    fields : ['name', 'keywords','description','author','version', 'stars', 'dlScore', 'dlDay', 'dlWeek', 'readme'],
    body: {
      from: (page - 1) * perPage,
      size : perPage,
      "query" : {
          "bool": {
            "should": [
                { "match": {
                  "name" : {
                    "query" : request.query.q,
                    "type" : "phrase",
                    "operator" : "and",
                    boost: 20
                  }
              }},
              {"match_phrase": {"keywords": request.query.q} },
              {"match_phrase": {"description": request.query.q} },
              {"match_phrase": {"readme": request.query.q} }
            ],
            "minimum_should_match": 1
          }
      }
    }
  };

  var start = Date.now();
  client.search(searchQuery, function (error, response) {
    request.metrics.metric({
      name: 'latency',
      value: Date.now() - start,
      type: 'elasticsearch',
      query: request.query.q
    });

    var opts = { };

    if (error) {
      request.logger.warn('elasticsearch failed searching ' + request.query.q);
      request.logger.error(error);
      return reply.view('errors/internal', opts).code(500);
    }

    request.timing.page = 'search';
    request.metrics.metric({ name: 'search', search: request.query.q });

    merge(opts, {
      title: 'results for '+request.query.q,
      page: page,
      q: request.query.q,
      results: response.hits.hits,
      totalResults: response.hits.total,
      singleResult: response.hits.total === 1,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: response.hits.total >= (perPage * page) ? page + 1 : null
    });

    if (opts.prevPage || opts.nextPage) {
      opts.pages = {};
      if (opts.prevPage) {
        opts.pages.prev = "/search?q=" + opts.q + "&page=" + opts.prevPage;
      }
      if (opts.nextPage) {
        opts.pages.next = "/search?q=" + opts.q + "&page=" + opts.nextPage;
      }
    }

    return reply.view('registry/search', opts);
  });
};