var gulp = require('gulp'); // Require gulp

var minifyCSS = require('gulp-minify-css'); // Minify the CSS

// Minification dependencies
var minifyHTML = require('gulp-minify-html'); // Minify HTML
var concat = require('gulp-concat'); // Join all JS files together to save space
var stripDebug = require('gulp-strip-debug'); // Remove debugging stuffs
var uglify = require('gulp-uglify'); // Minify JavaScript
var imagemin = require('gulp-imagemin'); // Minify images

// Other dependencies
var size = require('gulp-size'); // Get the size of the project

// Tasks -------------------------------------------------------------------- >


// Task to minify new or changed HTML pages
gulp.task('html', function() {
  gulp.src('./app/*.html')
    .pipe(minifyHTML())
    .pipe(gulp.dest('./build/'));
});

// Task to concat, strip debugging and minify JS files
gulp.task('scripts', function() {
  gulp.src(['./app/scripts/lib.js', './app/scripts/*.js'])
    .pipe(concat('script.js'))
    .pipe(stripDebug())
    .pipe(uglify())
    .pipe(gulp.dest('./build/scripts/'));
});

// Task to minify images into build
gulp.task('images', function() {
  gulp.src('./app/images/*')
  .pipe(imagemin({
    progressive: true,
  }))
  .pipe(gulp.dest('./build/images'));
});

// Task to get the size of the app project
gulp.task('size', function() {
  gulp.src('./app/**')
	.pipe(size({
    showFiles: true,
  }));
});

// Task to get the size of the build project
gulp.task('build-size', function() {
  gulp.src('./build/**')
  .pipe(size({
    showFiles: true,
  }));
});

// Serve application
gulp.task('serve', ['html', 'scripts', 'images', 'size'], function() {
});

// Run all Gulp tasks and serve application
gulp.task('default', ['serve'], function() {
});