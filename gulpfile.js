var gulp = require('gulp');
var fs = require('fs');

var concat = require('gulp-concat');
var ngAnnotate = require('gulp-ng-annotate');
var uglify = require('gulp-uglify');
var license = require('gulp-license');
var insert = require('gulp-insert');

gulp.task('default', function(){
	return gulp.src(['src/angular-gapi.module.js', 'src/*.js'])
		.pipe(concat('angular-gapi.min.js'))
		.pipe(ngAnnotate())
		.pipe(uglify())
		.pipe(insert.prepend(fs.readFileSync('NOTICE')))
		.pipe(gulp.dest('.'));
});