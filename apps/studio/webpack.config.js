var webpack = require('webpack');
var path = require('path');
var MiniCssExtractPlugin = require('mini-css-extract-plugin');
var fs = require('fs');

module.exports = function (env, argv) {
	var is_production = argv.mode === 'production';
	return {
	entry: [
		'./src/js/main.js',
	],
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'bundle.js',
		chunkFilename: '[name].js',
		publicPath: 'auto',
		clean: true
	},
	resolve: {
		extensions: ['.js', '.css', '.json'],
		alias: {
			'@visteras/fonts': path.resolve(__dirname, '../../packages/fonts/src/index.js'),
			Utilities: path.resolve(__dirname, 'node_modules'),
			'vp-local-keys': fs.existsSync(path.resolve(__dirname, 'src/js/config.keys.local.js'))
				? path.resolve(__dirname, 'src/js/config.keys.local.js')
				: path.resolve(__dirname, 'src/js/config.keys.stub.js'),
			sharp$: false,
			'onnxruntime-node$': false,
			'fs': false,
			'path': false,
			'crypto': false,
		}
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: [
					MiniCssExtractPlugin.loader,
					{
						loader: 'css-loader',
						options: {url: false}
					}
				]
			},
			{
				test: /\.js$/,
				exclude: /(node_modules|bower_components|libs\/hokusai\/hokusai_wasm\.js)/,
				use: ['babel-loader']
			},
			{
				// Studio ships hokusai WASM; ONNX Runtime WASM stays on jsDelivr (see bg-auto-worker).
				test: /\.wasm$/,
				exclude: /onnxruntime-web/,
				type: 'asset/resource',
				generator: {
					filename: '[name][ext]'
				}
			},
			{
				test: /onnxruntime-web[/\\].*\.wasm$/,
				type: 'asset/resource',
				generator: {
					filename: '[name][ext]',
					emit: false,
				}
			},
			{
				test: /\.(myb)$/,
				type: 'asset/source'
			},
		]
	},
	plugins: [
		new MiniCssExtractPlugin({
			filename: 'styles.css'
		}),
		new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery",
            "window.jQuery": "jquery"
		}),
		new webpack.DefinePlugin({
			VERSION: JSON.stringify(require("./package.json").version)
		}),
	],
	devtool: is_production ? false : "cheap-module-source-map",
	devServer: {
		// Match production: Studio at /studio/, Vector at /vector/
		open: ["/studio/"],
		devMiddleware: {
			// HTML uses relative dist/* under /studio/ → /studio/dist/*
			publicPath: "/studio/dist/",
		},
		static: [
			{
				directory: path.resolve(__dirname, "./"),
				publicPath: "/studio",
			},
			{
				directory: path.resolve(__dirname, "../vector"),
				publicPath: "/vector",
			},
			{
				directory: path.resolve(__dirname, "../publish/dist"),
				publicPath: "/publish",
			},
			{
				directory: path.resolve(__dirname, "../collage"),
				publicPath: "/collage",
			},
		],
		setupMiddlewares: function (middlewares, devServer) {
			if (!devServer || !devServer.app) {
				throw new Error("webpack-dev-server app is missing");
			}
			devServer.app.get("/", function (_req, res) {
				res.redirect("/studio/");
			});
			devServer.app.get("/vector", function (req, res, next) {
				if (req.path === "/vector") {
					return res.redirect("/vector/");
				}
				next();
			});
			devServer.app.get("/publish", function (req, res, next) {
				if (req.path === "/publish") {
					return res.redirect("/publish/");
				}
				next();
			});
			devServer.app.get("/collage", function (req, res, next) {
				if (req.path === "/collage") {
					return res.redirect("/collage/");
				}
				next();
			});
			return middlewares;
		},
	}
};
};