var gulp = require('gulp'); // Require gulp

var cleanCSS = require('gulp-clean-css'); // Minify the CSS

// Minification dependencies
var minifyHTML = require('gulp-minify-html'); // Minify HTML
var concat = require('gulp-concat'); // Join all JS files together to save space
var stripDebug = require('gulp-strip-debug'); // Remove debugging stuffs
var uglify = require('gulp-uglify'); // Minify JavaScript
var imagemin = require('gulp-imagemin'); // Minify images

// Other dependencies
var size = require('gulp-size'); // Get the size of the project

// Critical CSS
var critical = require('critical');


// Tasks -------------------------------------------------------------------- >

// Minify HTML
gulp.task('css', () => {
  return gulp.src('public/assets/css/*.css')
    .pipe(cleanCSS({compatibility: 'ie8'}))
    .pipe(gulp.dest('public/assets/css/'));
});

gulp.task('critical', () => {
  critical.generate({
    inline: true,
    minify: true,    
    base: 'public/',
    src: 'index.html',
    dest: 'index.html',
    width: 1300,
    height: 900
  });
});

// Task to minify new or changed HTML pages
gulp.task('html', function() {
  gulp.src('./public/*.html')
    .pipe(minifyHTML())
    .pipe(gulp.dest('./public/'));
});

// Task to concat, strip debugging and minify JS files
gulp.task('scripts', function() {
  gulp.src(['./public/assets/js/', './public/assets/js/*.js'])
    .pipe(concat('app.min.js'))
    .pipe(stripDebug())
    .pipe(uglify())
    .pipe(gulp.dest('./public/assets/js/'));
});

// Task to minify images into build
gulp.task('images', function() {
  gulp.src('./public/images/*')
  .pipe(imagemin({
    progressive: true,
  }))
  .pipe(gulp.dest('./public/images'));
});

// Task to get the size of the app project
gulp.task('size', function() {
  gulp.src('./public/**')
	.pipe(size({
    showFiles: true,
  }));
});

// Task to get the size of the build project
gulp.task('build-size', function() {
  gulp.src('./public/**')
  .pipe(size({
    showFiles: true,
  }));
});

// Serve application
gulp.task('serve', ['critical', 'css', 'html', 'scripts', 'images', 'size'], function() {
});

// Run all Gulp tasks and serve application
gulp.task('default', ['serve'], function() {
});