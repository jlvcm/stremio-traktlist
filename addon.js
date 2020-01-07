const { addonBuilder } = require('stremio-addon-sdk')
const cheerio = require('cheerio')
const request = require('request')
const package = require('./package.json')
const trakttypes = {'Trending':'trending','Popular':'popular','Watched - Week':'watched/weekly','Watched - Month':'watched/monthly','Watched - Year':'watched/yearly','Watched - All time':'watched/all'
,'Collected - Week':'collected/weekly','Collected - Month':'collected/monthly','Collected - Year':'collected/yearly','Collected - All time':'collected/all'}

const endpoint = 'https://trakt.tv/'
var IMDBID = {};

const oneDay = 24 * 60 * 60 // in seconds

const cache = {
	maxAge: oneDay, // one day
	staleError: 6 * 30 * oneDay // 6 months
}

const manifest = {
	id: 'community.traktlist',
	logo: 'https://trakt.tv/assets/logos/header@2x-09f929ba67b0964596b359f497884cd9.png.webp',
	version: package.version,
	catalogs: [{'type':'movie','id':'traktlist','name':'Trakt Top','extra': [
		{
		  name: 'genre',
		  options: Object.keys(trakttypes),
		  isRequired: false
		}
	  ]},{type:'series',id:'traktlist',name:'Trakt Top',extra: [
		{
		  name: 'genre',
		  options: Object.keys(trakttypes),
		  isRequired: false
		}
	  ]}],
	resources: ['catalog'],
	types: ['movies','series'],
	name: 'Trakt Top',
	description: 'trakt catalog list by most watched/collected',
	idPrefixes: [
		'tt'
	]
}
const builder = new addonBuilder(manifest)

function match(r,s,i){
	var m = s.match(r);
	return (m && m.length>i)?m[i]:''
}

function getIMDB(url){
	return new Promise((resolve, reject) => {
		request(endpoint+url, function (error, response, html) {
			if (!error && response.statusCode == 200) {
				var IMDB = match(/http:\/\/www\.imdb\.com\/title\/tt([^"']*)/,html,1).trim();
				var image = match(/<img class="real" data-original="(https:\/\/walter\.trakt\.tv\/images\/[^"']*)/,html,1).trim()+'.webp'
				if(IMDB.length>0){
					IMDBID[url] = {
						'id':'tt'+IMDB,
						'image':image
					}
					resolve(url);
				}
			}else{
				resolve(url);
			}
		});
	});
}
function getMovies(page,type='movies',cat=false){
	return new Promise((resolve, reject) => {
		request(endpoint+'/'+type+'/'+cat+'?page='+page, function (error, response, html) {
			if (!error && response.statusCode == 200) {
				const $ = cheerio.load(html,{ decodeEntities: false });
				var metas = [];
				var imdbFetch = [];
				var missingIMDB = [];
				var $items = $('.row.fanarts .grid-item.col-sm-6');
				for (let i = 0; i < $items.length; i++) {
					const $item = $($items[i]);
					const href = $item.find('a').attr('href');
					var imdb = '';
					if(href=='/vip') continue;
					if(IMDBID[href]){
						imdb = IMDBID[href]
					}else{
						imdbFetch.push(getIMDB(href));
					}
					missingIMDB.push(metas.length);
					
					metas.push({
						id:imdb,
						name:$item.find('h3').text().replace(/\"/g,''),
						banner:$item.find('.real').attr('data-original').trim()+'.webp',
						year: $item.find('.year').text().replace(/\(|\)|\W/g,''),
					//	imdbRating: $item.find('.mp-rating-imdb').text().trim().split('/')[0],
						posterShape: 'regular',
						type:type=='movies'?'movie':'series',
						href:href
					})
				}
				if(missingIMDB.length>0){
					Promise.all(imdbFetch).then(function(values){
						for (let i = 0; i < missingIMDB.length; i++) {
							const elem = metas[missingIMDB[i]];
							if(IMDBID[elem.href]){
								elem.id = IMDBID[elem.href]['id'];
								elem.post = IMDBID[elem.href]['image']
							}
						}
						resolve(metas);
					});
				}else{
					resolve(metas);
				}
				
			}else{
				reject();
			}
		});
	});
}


// 
https://api.themoviedb.org
builder.defineCatalogHandler(function(args, cb) {
	// filter the dataset object and only take the requested type

	const cat = (args.extra || {}).genre ? trakttypes[args.extra.genre] : 'trending';
	const start = (args.extra || {}).skip ? Math.round(args.extra.skip / 37) + 1 : 1
	const type = args.type=='movie'?'movies':'shows'

	return new Promise((resolve, reject) => {
		getMovies(start,type,cat).then(function(values) {
			resolve({
				metas:[].concat.apply([], values),
				cacheMaxAge: cache.maxAge,
				staleError: cache.staleError
			});
		});
	});
});

module.exports = builder.getInterface()