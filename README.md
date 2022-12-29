# adrianmoreno.info #

This repository holds the information, structure and design in [www.adrianmoreno.info](http://www.adrianmoreno.info). This is a playground where I play around with some technologies, try to optimize the website with Google Page Speed Insights, or test some gulp scripts. 

It's a good excuse to overengineer a CV-website, isn't it? ;-)

### Design ###

It's based on the nice and simple [Raditian Theme](https://github.com/radity/raditian-free-hugo-theme) by [Radity](https://radity.com/en/), based on bootstrap 4.
The template in this repo is heavily modified (adding assets pipeline support, some i18n features, additional pages/templates, performance and accessibility improvements...).

TODO: fork and open source the changes I made for this repo.
### Generation ###

The content is generated with [Hugo](https://gohugo.io/), a very fast, flexible and tuneable static content generator. It's made with go, the first reason I started to play around with it - later I discovered its power and strong community.

#### Running locally

[Installing Hugo](https://gohugo.io/getting-started/installing/) is a pre-requirement. 
After that, the commands from [Hugo CLI](https://gohugo.io/getting-started/usage/) can be used, like `hugo serve`.

### Deployment

The code in this repo is later procesed with [Github Actions](https://github.com/zetxek/adrianmoreno.info/actions) - which will generate the HTML with hugo, process the CSS, images and JS with gulp, and export the contents to Vercel.

As simple as it gets!

__Note __
I switched from Cloudfront to Vercel because Cloudfront [doesn't support a root object defined for all folders](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DefaultRootObject.html) (ie: an `index.html` for the `/experience` path). At some point I might try [the option to make them work with Lambda functions](https://robkenis.com/posts/hugo_pretty_urls_on_aws/), but that will be also a chance to revamp the project infrastructure and set it up as Infrastructure as Code (setting it up with CDK or Terraform).

### More? ###

Do you want some more info about how or why I did some thing on the site? Drop me a line! (the form is connected to [formspree.io](https://formspree.io/) by the way, another great piece of software).