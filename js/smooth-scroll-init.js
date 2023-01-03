const scroll = new SmoothScroll('a[href*="#"]');
    $('a.nav-link').on('click', () => {
      const navbar = $('.navbar-collapse');
      if (navbar && navbar.hasClass('show')) {
        $('.navbar-toggler').click();
      }
    })