module github.com/zetxek/adrianmoreno.info

go 1.20

// for local development
// replace github.com/zetxek/adritian-free-hugo-theme => ../adritian-free-hugo-theme

// TODO: pinned to a pseudo-version at the tip of the theme's unmerged
// fix/meta-description-fallback branch (https://github.com/zetxek/adritian-free-hugo-theme/pull/561)
// so this site can adopt the title/description i18n migration early.
// Switch to the released tag once that PR merges.
require github.com/zetxek/adritian-free-hugo-theme v1.9.16-0.20260714184409-edcd0b6c228d // indirect
