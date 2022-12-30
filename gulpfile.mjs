import gulp from "gulp";
export default defaultTask;
var critical = require('critical'); // new


// Default Task
gulp.task('default', ['connect']);

// Critical-path CSS
gulp.task('copystyles', function () {
  return gulp.src('./build/assets/combined.css')
      .pipe(rename({
          basename: "site" // site.css
      }))
      .pipe(gulp.dest('./build/assets/'));
});

gulp.task('criticalcss', function (cb) {
  critical.generateInline({
      base: './build/',
      src: 'index.html',
      styleTarget: './assets/combined.css',
      htmlTarget: 'index.html',
      width: 960,
      height: 600,
      minify: true
  }, cb.bind(cb));
});

gulp.task('critical', ['clean'], function () {
runSequence('build', 'copystyles', function(){
  // Note this is a temporary hack. 
  setTimeout(function(){
    gulp.start('criticalcss');
  }, 5000);
});
});
// end critical-path css
