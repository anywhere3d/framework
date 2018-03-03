require('./index');

const Fs = require('fs');
const Path = require('path');
const CONSOLE = process.argv.indexOf('restart') === -1;
const META = {};

var BUNDLED = false;
var RESTORED = {};

META.version = 1;
META.created = new Date();
META.total = 'v' + F.version_header;
META.node = F.version_node;
META.files = [];
META.directories = [];

exports.make = function(callback) {

	var path = F.path.root();
	var blacklist = {}

	if (CONSOLE) {
		console.log('==================== BUNDLING ======================');
		console.time('Done');
	}

	blacklist[F.config['directory-temp']] = 1;
	blacklist[F.config['directory-bundles']] = 1;
	blacklist[F.config['directory-src']] = 1;
	blacklist['/node_modules/'] = 1;
	// blacklist['/debug.js'] = 1;
	blacklist['/debug.pid'] = 1;
	blacklist['/package.json'] = 1;
	blacklist['/bundle.json'] = 1;

	var Files = [];
	var Dirs = [];
	var Merge = [];
	var Length = path.length;
	var async = [];

	async.push(cleanFiles);

	async.push(function(next) {
		var target = F.path.root(F.config['directory-src']);
		U.ls(F.path.root(F.config['directory-bundles']), function(files) {
			files.wait(function(filename, resume) {
				var dbpath = F.config['directory-databases'];

				F.restore(filename, target, resume, function(p, dir) {
					if (dir) {
						if (!p.startsWith(dbpath) && META.directories.indexOf(p) === -1)
							META.directories.push(p);
					} else {

						var exists = false;
						try {
							exists = Fs.statSync(Path.join(target, p)) != null;
						} catch (e) {}

						// DB file
						if (exists && p.startsWith(dbpath))
							return false;

						if (p === '/config' || p === '/sitemap' || p === '/workflows' || U.getExtension(p) === 'resource') {
							var hash = Math.random().toString(16).substring(5);
							Merge.push({ name: p, filename: Path.join(target, p + hash) });
							META.files.push(p + hash);
							return p + hash;
						}

						if (META.files.indexOf(p) === -1)
							META.files.push(p);
					}

					return true;
				});
			}, next);
		});
	});

	async.push(function(next) {
		if (Merge.length) {
			copyFiles(Merge, function() {
				for (var i = 0, length = Merge.length; i < length; i++) {
					try {
						Fs.unlinkSync(Merge[i].filename);
					} catch(e) {}
				}
				next();
			});
		} else
			next();
	})

	async.push(function(next) {
		U.ls(path, function(files, dirs) {

			for (var i = 0, length = dirs.length; i < length; i++)
				Dirs.push(dirs[i].substring(Length));

			for (var i = 0, length = files.length; i < length; i++) {
				var file = files[i].substring(Length);
				var type = 0;

				if (file.startsWith(F.config['directory-databases']))
					type = 1;
				else if (file.startsWith(F.config['directory-public']))
					type = 2;
				Files.push({ name: file, filename: files[i], type: type });
			}

			next();
		}, (p, dir) => blacklist[p.substring(Length)] == null);
	});

	async.push(function(next) {
		createDirectories(Dirs, function() {
			copyFiles(Files, next);
		});
	});

	async.push(function(next) {
		Fs.writeFileSync(F.path.root('bundle.json'), JSON.stringify(META, null, '\t'));
		next();
	});

	async.async(function() {
		CONSOLE && console.timeEnd('Done');
		callback();
	});

};

function cleanFiles(callback) {

	var path = F.path.root(F.config['directory-src']);
	var length = path.length - 1;
	var blacklist = {};

	blacklist[F.config['directory-public']] = 1;
	blacklist[F.config['directory-private']] = 1;
	blacklist[F.config['directory-databases']] = 1;

	var meta = {};
	try {
		meta = U.parseJSON(Fs.readFileSync(F.path.root('bundle.json')).toString('utf8'), true);
		BUNDLED = true;
	} catch (e) {}

	var restore = [];

	if (meta.files && meta.files.length) {
		for (var i = 0, length = meta.files.length; i < length; i++) {

			var filename = meta.files[i];
			var ext = U.getExtension(filename);

			if (ext === 'resource' || (!ext && U.getName(filename).indexOf('config') !== -1))
				restore.push(filename);

			try {
				F.consoledebug('Remove', filename);
				Fs.unlinkSync(Path.join(path, filename));
			} catch (e) {}
		}
	}

	if (meta.directories && meta.directories.length) {
		meta.directories.quicksort('length', false);
		for (var i = 0, length = meta.directories.length; i < length; i++) {
			try {
				Fs.rmdirSync(Path.join(path, meta.directories[i]));
			} catch (e) {}
		}
	}

	callback();
}

function createDirectories(dirs, callback) {

	var path = F.path.root(F.config['directory-src']);

	try {
		Fs.mkdirSync(path);
	} catch(e) {}

	for (var i = 0, length = dirs.length; i < length; i++) {
		if (META.directories.indexOf(dirs[i]) === -1)
			META.directories.push(dirs[i]);
		try {
			Fs.mkdirSync(Path.join(path, dirs[i]));
		} catch (e) {}
	}

	callback();
}

function copyFiles(files, callback) {
	var path = F.path.root(F.config['directory-src']);
	files.wait(function(file, next) {

		var filename = Path.join(path, file.name);
		var exists = false;
		var ext = U.getExtension(file.name);
		var append = false;

		try {
			exists = Fs.statSync(filename) != null;
		} catch (e) {}

		// DB file
		if (file.type === 1 && exists) {
			next();
			return;
		}

		if (file.type !== 1 && META.files.indexOf(file.name) === -1)
			META.files.push(file.name);

		if (exists && (ext === 'resource' || (!ext && file.name.substring(1, 7) === 'config')))
			append = true;

		if (file.type !== 1 && META.files.indexOf(file.name) === -1)
			META.files.push(file.name);

		if (CONSOLE && exists)
			if (F.config['allow-debug'])
				F.consoledebug(append ? 'EXT: ' : 'REW:', file.name);
			else
				console.warn(append ? 'EXT:' : 'REW :', file.name)
		else
			F.consoledebug(append ? 'EXT:' :   'COP:', file.name);

		if (append) {
			Fs.appendFile(filename, '\n' + Fs.readFileSync(file.filename).toString('utf8'), next)
		} else
			copyFile(file.filename, filename, next);

		if (CONSOLE && exists)
			if (F.config['allow-debug'])
				F.consoledebug('REW:', file.name);
			else
				console.warn('REW:', file.name)
		else
			F.consoledebug('COP:', file.name);

	}, callback);
}

function copyFile(oldname, newname, callback) {
	writer = Fs.createWriteStream(newname);
	writer.on('finish', callback);
	Fs.createReadStream(oldname).pipe(writer);
}