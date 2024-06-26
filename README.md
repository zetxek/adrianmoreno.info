# adrianmoreno.info #

This repository holds the information, structure and design in [www.adrianmoreno.info](http://www.adrianmoreno.info). This is a playground where I experiment with some technologies, try to optimize the website with Google Page Speed Insights, or test some gulp scripts. 

It's a good excuse to overengineer a CV-website, isn't it? ;-)

### Theme: [Adritian](https://github.com/zetxek/adritian-free-hugo-theme) ###

<img width="1340" alt="website-screenshot" src="https://user-images.githubusercontent.com/240085/211220892-f1ebeb35-224e-4e2e-925d-c7116527208f.png">

The page theme is open sourced independently from this site, as a hugo theme [Adritian]([url](https://github.com/zetxek/adritian-free-hugo-theme)) in [its own repo](https://github.com/zetxek/adritian-free-hugo-theme).

It is based on [Raditian Theme](https://github.com/radity/raditian-free-hugo-theme), then I forked it and evolved it quite deeply, upgrading Bootstrap 4 to 5, removing jQuery as a dependency or adding new content types.

### Generation ###

The content is generated with [Hugo](https://gohugo.io/), a very fast, flexible and tuneable static content generator. It's made with go, the first reason I started to play around with it - later I discovered its power and strong community.


#### Running locally

[Installing Hugo](https://gohugo.io/getting-started/installing/) is a pre-requirement. 
After that, the commands from [Hugo CLI](https://gohugo.io/getting-started/usage/) can be used, like `hugo serve`.

### Deployment

The code in this repo is later procesed with [Github Actions](https://github.com/zetxek/adrianmoreno.info/actions) - which will generate the HTML with hugo, process the CSS, images and JS with gulp, and export the contents to [Vercel](https://vercel.com).

As simple as it gets!

_Note_

I switched from AWS Cloudfront to Vercel because Cloudfront [doesn't support a root object defined for all folders](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DefaultRootObject.html) (ie: an `index.html` for the `/experience` path). At some point I might try [the option to make them work with Lambda functions](https://robkenis.com/posts/hugo_pretty_urls_on_aws/), but that will be also a chance to revamp the project infrastructure and set it up as Infrastructure as Code (setting it up with CDK or Terraform).

### More? ###

Do you want some more info about how or why I did some thing on the site? Drop me a line! (the form is connected to [formspree.io](https://formspree.io/) by the way, another great piece of software).
