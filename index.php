<!DOCTYPE HTML>
<!--
	Miniport 2.0 by HTML5 UP
	html5up.net | @n33co
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
-->
<html>
	<head>
		<title>Adrián Moreno Peña · Web & Mobile Developer, all-around coder</title>
		<link rel="shortcut icon" href="/favicon.ico">
		<meta http-equiv="content-type" content="text/html; charset=utf-8" />
		<meta name="description" content="" />
		<meta name="keywords" content="" />
		<link href="http://fonts.googleapis.com/css?family=Open+Sans:300,600,700" rel="stylesheet" />
		<script src="js/jquery.min.js"></script>
		<script src="js/config.js"></script>
		<script src="js/skel.min.js"></script>
		<noscript>
			<link rel="stylesheet" href="css/skel-noscript.css" />
			<link rel="stylesheet" href="css/style.css" />
			<link rel="stylesheet" href="css/style-desktop.css" />
		</noscript>
		<!--[if lte IE 9]><link rel="stylesheet" href="css/ie9.css" /><![endif]-->
		<!--[if lte IE 8]><script src="js/html5shiv.js"></script><link rel="stylesheet" href="css/ie8.css" /><![endif]-->
		<!--[if lte IE 7]><link rel="stylesheet" href="css/ie7.css" /><![endif]-->
		<script>
		$(document).ready(function(){
			$("#thanks").fadeIn('slow').delay(2000).fadeOut('slow');
			$("#button-send").click(function(){
				console.log("Sending");
			});
		});
		</script>
		<script type="text/javascript">

		  var _gaq = _gaq || [];
		  _gaq.push(['_setAccount', 'UA-465407-4']);
		  _gaq.push(['_trackPageview']);

		  (function() {
		    var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
		    ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
		    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
		  })();

		</script>
	</head>
	<body>

		<!-- Nav -->
			<nav id="nav">
				<a id="home" href="#top"><span class="icon icon-home"></span></a>
				<span id="lang-switch"><a href="index_es.php">Spanish</a></span>
				<ul class="container">
					<li><a href="#skills">Skills</a></li>
					<li><a href="#resume">Résumé</a></li>
					<li><a href="#contact">Contact</a></li>
				</ul>
			</nav>

		<!-- Home -->
			<div class="wrapper wrapper-style1 wrapper-first">

				<?php if ($_GET['success']){ ?>
				<div id="thanks" class="button button-big" style="margin-bottom: 40px">
                    Thanks for the contact! I'll try to answer asap
				</div>
				<?php } ?>

				<article class="container" id="top">
				

					<div class="row">
						<div class="4u">
							<span class="me image image-full"><img src="images/me.jpg" alt="" /></span>
						</div>
						<div class="8u">
							<header>
								<h1>Hi. I'm <strong>Adrián Moreno Peña</strong>.</h1>
							</header>
							<p>I'm also known as zetxek around the Internet, and this is my online resume. Here you can find some of the things I've built, know about my ninja coding skills or get in contact.</p>
							<a href="#skills" class="button button-big">What do I know how to do?</a>
						</div>
					</div>
				</article>
			</div>

		<!-- Work -->
			<div class="wrapper wrapper-style2">
				<article id="skills">
					<header>
						<h2>I ❤ software</h2></h2>
						<span>Specifically, building great apps and webs</span>
					</header>
					<div class="container">
						<div class="row">
							<div class="4u">
								<section class="box box-style1">
									<span class="icon featured-icon icon-beaker"></span>
									<h3>Web</h3>
									<p>HTML5, CSS3, Javascript, Javascript Frameworks (jQuery, jQuery UI, jQuery Mobile, MooTools, …), Content Management Systems (Wordpress, Drupal,…), e-Commerce Systems (Magento, OpenCart, VirtueMart, UberCart…)</p>
								</section>
							</div>
							<div class="4u">
								<section class="box box-style1">
									<span class="icon featured-icon icon-mobile-phone"></span>
									<h3>Mobile</h3>
									<p>Mobile web (HTML5, CSS & JS, Apache Cordova), native development (Java Android, Objetive-C iOS, Web techs for BB10…), multi-platform frameworks (Titanium Appcelerator).</p>
								</section>
							</div>
							<div class="4u">
								<section class="box box-style1">
									<span class="icon featured-icon icon-thumbs-up"></span>
									<h3>All around!</h3>
									<p>Everything around software projects, you name it. Project planning, agile project management, system administration, software translation, software integration, platform architecture design…</p>
								</section>
							</div>
						</div>
					</div>
					<footer>
						<p>And overall, I like learning new stuff and trying new technologies</p>
						<a href="#resume" class="button button-big">Go get my downloadable resumé</a>
					</footer>
				</article>
			</div>

		<!-- Portfolio -->
			<div class="wrapper wrapper-style3">
				<article id="resume">
					<header>
						<h2>The reason of this webpage</h2>
						<span>In a variety of flavours and file formats</span>
					</header>
					<div class="container">
						<div class="row">
							<div class="12u">
							</div>
						</div>
						<div class="row">
							<div class="4u">
								<article class="box box-style2">
									<a href="http://adrianmoreno.info/files/cv_adrian_moreno_english.pdf" class="image image-full"><img src="images/cv01.jpg" alt="" /></a>
									<h3><a href="http://adrianmoreno.info/files/cv_adrian_moreno_english.pdf">PDF (english)</a></h3>
									<p>53 Kb, 3 pages long</p>
								</article>
							</div>
							<div class="4u">
								<article class="box box-style2">
									<a href="http://adrianmoreno.info/files/cv_adrian_moreno.pdf" class="image image-full"><img src="images/cv02.jpg" alt="" /></a>
									<h3><a href="http://adrianmoreno.info/files/cv_adrian_moreno.pdf">PDF (spanish)</a></h3>
									<p>51 Kb, 3 pages long</p>
								</article>
							</div>
							<div class="4u">
								<article class="box box-style2">
									<a href="http://adrianmoreno.info/files/cv_adrian_moreno.html" class="image image-full"><img src="images/cv03.jpg" alt="" /></a>
									<h3><a href="http://adrianmoreno.info/files/cv_adrian_moreno.html">HTML (spanish)</a></h3>
									<p>Plain ol' HTML, good for SEO</p>
								</article>
							</div>
						</div>
						<!--<div class="row">
							<div class="4u">
								<article class="box box-style2">
									<a href="http://flypixel.com/n33-pattern-set-1/3522389001865317" class="image image-full"><img src="images/portfolio04.jpg" alt="" /></a>
									<h3><a href="http://flypixel.com/n33-pattern-set-1/3522389001865317">Tempus dolore</a></h3>
									<p>Ornare nulla proin odio consequat.</p>
								</article>
							</div>
							<div class="4u">
								<article class="box box-style2">
									<a href="http://flypixel.com/cityscape/9803996277226316" class="image image-full"><img src="images/portfolio05.jpg" alt="" /></a>
									<h3><a href="http://flypixel.com/cityscape/9803996277226316">Feugiat aliquam</a></h3>
									<p>Ornare nulla proin odio consequat.</p>
								</article>
							</div>
							<div class="4u">
								<article class="box box-style2">
									<a href="http://flypixel.com/n33" class="image image-full"><img src="images/portfolio06.jpg" alt="" /></a>
									<h3><a href="http://flypixel.com/n33">Sed amet ornare</a></h3>
									<p>Ornare nulla proin odio consequat.</p>
								</article>
							</div>
						</div>-->
					</div>
					<footer>
						<p>Have I already convinced you that I'm the best fit for your job?</p>
						<a href="#contact" class="button button-big">Get in touch with me</a>
					</footer>
				</article>
			</div>

		<!-- Contact -->
			<div class="wrapper wrapper-style4">
				<article id="contact" class="container small">
					<header>
						<h2>Want to hire me? Get in touch!</h2>
						<span>Want to phone me? Reach me on <a href="tel:+34 676137567">+34 676 13 75 67</a></span>
					</header>
					<div>
						<div class="row">
							<div class="12u">
								<form method="post" action="mail.php">
									<div>
										<div class="row half">
											<div class="6u">
												<input type="text" name="name" id="name" placeholder="Name" />
											</div>
											<div class="6u">
												<input type="text" name="email" id="email" placeholder="Email" />
											</div>
										</div>
										<div class="row half">
											<div class="12u">
												<input type="text" name="subject" id="subject" placeholder="Subject" />
											</div>
										</div>
										<div class="row half">
											<div class="12u">
												<textarea name="message" id="message" placeholder="Message"></textarea>
											</div>
										</div>
										<div class="row">
											<div class="12u">
												<a href="#contact" class="button form-button-submit" id="button-send">Send Message</a>
												<a href="#" class="button button-alt form-button-reset">Clear Form</a>
											</div>
										</div>
									</div>
								</form>
							</div>
						</div>
						<div class="row row-special">
							<div class="12u">
								<h3>Find me on ...</h3>
								<ul class="social">
									<li class="rss"><a href="http://bloqnum.com" class="icon icon-rss"><span>Blog</span></a></li>
									<li class="twitter"><a href="http://twitter.com/zetxek" class="icon icon-twitter"><span>Twitter</span></a></li>
									<li class="facebook"><a href="http://twitter.com/adrianmp" class="icon icon-facebook"><span>Facebook</span></a></li>
									<!--<li class="dribbble"><a href="http://dribbble.com/n33" class="icon icon-dribbble"><span>Dribbble</span></a></li>-->
									<li class="linkedin"><a href="http://es.linkedin.com/in/adrianmoreno" class="icon icon-linkedin"><span>LinkedIn</span></a></li>
									<!--<li class="tumblr"><a href="#" class="icon icon-tumblr"><span>Tumblr</span></a></li>-->
									<li class="googleplus"><a href="https://plus.google.com/114734617841208618721" class="icon icon-google-plus"><span>Google+</span></a></li>
									<li class="github"><a href="https://github.com/zetxek" class="icon icon-github"><span>Github</span></a></li>
									<li class="instagram"><a href="https://instagram.com/zetxek" class="icon icon-instagram"><span>Instagram</span></a></li>
									</ul>
							</div>
						</div>
					</div>
					<footer>
						<p id="copyright">
							Design by: <a href="http://html5up.net/">HTML5 UP</a>
						</p>
					</footer>
				</article>
			</div>
	</body>
</html>