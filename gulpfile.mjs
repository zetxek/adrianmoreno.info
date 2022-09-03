import imagemin from "gulp-imagemin"; // Minify images
import gulp from "gulp";

import cleanCSS from "gulp-clean-css";
import htmlmin from "gulp-htmlmin";
import concat from "gulp-concat";
import GulpUglify from "gulp-uglify";
import size from "gulp-size";

export default defaultTask;

async function defaultTask() {
  gulp.task("default", gulp.series(["css", "size"]), function () {
    return Promise.resolve("");
  });
}

gulp.task("css", () => {
  return gulp
    .src("public/css/*.css")
    .pipe(cleanCSS({ compatibility: "ie8" }))
    .pipe(gulp.dest("public/css/"));
});

// Task to minify new or changed HTML pages
gulp.task("html", function () {
  gulp
    .src("./public/index.html", { base: "./" })
    .pipe(htmlmin())
    .pipe(gulp.dest("./"));

  return gulp
    .src("./public/es/index.html", { base: "./" })
    .pipe(htmlmin())
    .pipe(gulp.dest("./"));
});

// Task to concat, strip debugging and minify JS files
gulp.task("scripts", function () {
  return gulp
    .src(["./public/js/", "./public/js/*.js"])
    .pipe(concat("app.min.js"))
    .pipe(gulpStripDebug())
    .pipe(GulpUglify())
    .pipe(gulp.dest("./public/js/"));
});

// Task to minify images into build
gulp.task("images", function () {
  return gulp
    .src("./public/img/*")
    .pipe(
      imagemin({
        progressive: true,
      })
    )
    .pipe(gulp.dest("./public/img"));
});

// Task to get the size of the app project
gulp.task("size", function () {
  return gulp.src("./public/**").pipe(
    size({
      showFiles: true,
    })
  );
});

// Task to get the size of the build project
gulp.task("build-size", function () {
  return gulp.src("./public/**").pipe(
    size({
      showFiles: true,
    })
  );
});
