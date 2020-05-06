# adrianmoreno.info #

This repository holds the information, structure and design in [www.adrianmoreno.info](http://www.adrianmoreno.info). This is a playground where I play around with some technologies, try to optimize the website with Google Page Speed Insights, or test some gulp scripts. 

It's a good excuse to overengineer a CV-website, isn't it? ;-)

### Design ###

It's based on the nice and simple [Raditian Theme](https://github.com/radity/raditian-free-hugo-theme) by [Radity](https://radity.com/en/) (for which I will probably make [some more contributions](https://github.com/zetxek/raditian-free-hugo-theme), it's a very nice starting theme).

Why a theme instead of coding everytjing from scratch? Because I will focus too much in the tool itself instead of getting something done and improving the content of the site :-)

### Generation ###

The content is generated with [Hugo](https://gohugo.io/), a very fast, flexible and tuneable static content generator. It's made with go, the first reason I started to play around with it - later I discovered its power and strong community.

### Deployment

The code in this repo is later procesed with [Github Actions](https://github.com/zetxek/adrianmoreno.info/actions) - which will generate the HTML with hugo, process the CSS, images and JS with gulp, and export the contents to AWS's S3.

The site is later on served by Cloudfront - no backend code used or needed.

As simple as it gets!

### More? ###

Do you want some more info about how or why I did some thing on the site? Drop me a line! (the form is connected to [formspree.io](https://formspree.io/) by the way, another great piece of software).