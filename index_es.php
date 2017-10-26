<!DOCTYPE HTML>
<!--
	Miniport 2.0 by HTML5 UP
	html5up.net | @n33co
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
-->
<html>
	<head>
		<title>Adrián Moreno Peña · Desarrollador web & móvil, programador todoterreno</title>
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
			//$("#button-send").click(function(){
			//	console.log("Sending");
			//});
			$("form").submit(function(event) {
		   var recaptcha = $("#g-recaptcha-response").val();
		   if (recaptcha === "") {
		      event.preventDefault();
		      alert("Please check the captcha");
		   }
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
		<script src='https://www.google.com/recaptcha/api.js'></script>
	</head>
	<body>

		<!-- Nav -->
			<nav id="nav">
				<a id="home" href="#top"><span class="icon icon-home"></span></a>
				<span id="lang-switch"><a href="index.html">English</a></span>
				<ul class="container">
					<li><a href="#skills">Habilidades</a></li>
					<li><a href="#resume">Currículum</a></li>
					<li><a href="#contact">Contacto</a></li>
				</ul>
			</nav>

		<!-- Home -->
			<div class="wrapper wrapper-style1 wrapper-first">

				<?php if ($_GET['success']){ ?>
				<div id="thanks" class="button button-big" style="margin-bottom: 40px">
                    Gracias por el contacto! Intentaré responder cuanto antes
				</div>
				<?php } ?>

				<article class="container" id="top">


					<div class="row">
						<div class="4u">
							<span class="me image image-full"><img src="images/me.jpg" alt="" /></span>
						</div>
						<div class="8u">
							<header>
								<h1 style="font-size: 3em">Hola. Soy <strong>Adrián Moreno Peña</strong>.</h1>
							</header>
							<p>También se me conoce como zetxek en Internet, y este es mi currículum online.  Aquí comento algunas de mis habilidades, lo que me gusta hacer con código, y puedes ponerte en contacto conmigo.</p>
							<a href="#skills" class="button button-big">¿Qué sé hacer?</a>
						</div>
					</div>
				</article>
			</div>

		<!-- Work -->
			<div class="wrapper wrapper-style2">
				<article id="skills">
					<header>
						<h2>Yo ❤ software</h2></h2>
						<span>En concreto, crear grandes apps móviles y webs</span>
					</header>
					<div class="container">
						<div class="row">
							<div class="4u">
								<section class="box box-style1">
									<span class="icon featured-icon icon-beaker"></span>
									<h3>Web</h3>
									<p>HTML5, CSS3, Javascript, Frameworks Javascript (jQuery, jQuery UI, jQuery Mobile, MooTools, …), Gestores de Contenidos(Wordpress, Drupal,…), Sistemas e-Commerce (Magento, OpenCart, VirtueMart, UberCart…)</p>
								</section>
							</div>
							<div class="4u">
								<section class="box box-style1">
									<span class="icon featured-icon icon-mobile-phone"></span>
									<h3>Móvil</h3>
									<p>Web móvil (HTML5, CSS & JS, Apache Cordova), desarrollo nativo (Java Android, Objetive-C iOS, Web APIs para BB10…), frameworks multiplataforma (Titanium Appcelerator).</p>
								</section>
							</div>
							<div class="4u">
								<section class="box box-style1">
									<span class="icon featured-icon icon-thumbs-up"></span>
									<h3>¡De todo un poco!</h3>
									<p>De todo en torno a proyectos de software: planificación de proyectos, desarrollo ágil, administración de sistemas, traducción de software, consultoría open source,  integración de sistemas, diseño de plataformas…</p>
								</section>
							</div>
						</div>
					</div>
					<footer>
						<p>Y, sobre todo, me gusta aprender sobre nuevas tecnologías</p>
						<a href="#resume" class="button button-big">Obtén mi CV descargable</a>
					</footer>
				</article>
			</div>

		<!-- Portfolio -->
			<div class="wrapper wrapper-style3">
				<article id="resume">
					<header>
						<h2>La razón de ser de esta web</h2>
						<span>En una variedad de sabores y formatos de fichero</span>
					</header>
					<div class="container">
						<div class="row">
							<div class="12u">
							</div>
						</div>
						<div class="row">
							<div class="6u">
								<article class="box box-style2">
									<a href="http://adrianmoreno.info/files/cv_adrian_moreno_english.pdf" class="image image-full"><img src="images/cv01.jpg" alt="" /></a>
									<h3><a href="http://adrianmoreno.info/files/cv_adrian_moreno_english.pdf">PDF (inglés)</a></h3>
									<p>183 Kb, 2 páginas</p>
								</article>
							</div>
							<div class="6u">
								<article class="box box-style2">
									<a href="http://adrianmoreno.info/files/cv_cover_adrian_moreno_english.pdf" class="image image-full"><img src="images/cv02.jpg" alt="" /></a>
									<h3><a href="http://adrianmoreno.info/files/cv_cover_adrian_moreno_english.pdf">PDF (inglés, con cover letter)</a></h3>
									<p>269 Kb, 3 páginas</p>
								</article>
							</div>

						</div>
					</div>
					<footer>
						<p>¿Te he convencido de que soy el mejor para tu trabajo?</p>
						<a href="#contact" class="button button-big">Contacta conmigo</a>
					</footer>
				</article>
			</div>

		<!-- Contact -->
			<div class="wrapper wrapper-style4">
				<article id="contact" class="container small">
					<header>
						<h2>¿Quieres que trabaje contigo? ¡Contáctame!</h2>
						<span>¿Quieres llamarme por teléfono? Llámame a <a href="tel:+34 676137567">+34 676 13 75 67</a></span>
					</header>
					<div>
						<div class="row">
							<div class="12u">
								<form method="post" action="mail.php">
									<div>
										<div class="row half">
											<div class="6u">
												<input type="text" name="name" id="name" placeholder="Nombre" />
											</div>
											<div class="6u">
												<input type="text" name="email" id="email" placeholder="Email" />
											</div>
										</div>
										<div class="row half">
											<div class="12u">
												<input type="text" name="subject" id="subject" placeholder="Asunto" />
											</div>
										</div>
										<div class="row half">
											<div class="12u">
												<textarea name="message" id="message" placeholder="Mensaje"></textarea>
											</div>
										</div>
										<div class="row">
											<div class="4u">
												<div class="g-recaptcha" data-sitekey="6Lfy-SsUAAAAAJmVEiH0smVmGNPVVCFm0LZ4ZaW1"></div>
											</div>
											<div class="4u">
												<button
													href="#contact"
													class="button form-button-submit"
													id="button-send"
													>
													Enviar mensaje
												</button>
											</div>
											<div class="4u">
												<a href="#" class="button button-alt form-button-reset">Borrar</a>
											</div>
											</div>									</div>
								</form>
							</div>
						</div>
						<div class="row row-special">
							<div class="12u">
								<h3>Encuéntrame en…</h3>
								<ul class="social">
									<li class="rss"><a href="http://bloqnum.com" class="icon icon-rss"><span>Blog</span></a></li>
									<li class="twitter"><a href="http://twitter.com/zetxek" class="icon icon-twitter"><span>Twitter</span></a></li>
									<li class="facebook"><a href="http://facebook.com/zetxek" class="icon icon-facebook"><span>Facebook</span></a></li>
									<li class="instagram"><a href="https://instagram.com/zetxek" class="icon icon-instagram"><span>Instagram</span></a></li>
									<!--<li class="dribbble"><a href="http://dribbble.com/n33" class="icon icon-dribbble"><span>Dribbble</span></a></li>-->
									<li class="linkedin"><a href="http://es.linkedin.com/in/adrianmoreno" class="icon icon-linkedin"><span>LinkedIn</span></a></li>
									<!--<li class="tumblr"><a href="#" class="icon icon-tumblr"><span>Tumblr</span></a></li>-->
									<li class="googleplus"><a href="https://plus.google.com/114734617841208618721" class="icon icon-google-plus"><span>Google+</span></a></li>
									<li class="github"><a href="https://github.com/zetxek" class="icon icon-github"><span>Github</span></a></li>
									<li class="bitbucket"><a href="https://bitbucket.org/zetxek" class="icon icon-bitbucket"><span>Bitbucket</span></a></li>
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
