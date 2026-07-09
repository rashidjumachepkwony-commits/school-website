// ============================================
// MOBILE MENU TOGGLE
// ============================================
function toggleMobileMenu() {
    const nav = document.querySelector('.nav-links');
    nav.classList.toggle('open');
}

// ============================================
// CLOSE MOBILE MENU ON LINK CLICK
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            const nav = document.querySelector('.nav-links');
            nav.classList.remove('open');
        });
    });
});

// ============================================
// ANIMATED COUNTER FOR STATS
// ============================================
function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');
    counters.forEach(counter => {
        const text = counter.textContent;
        const number = parseInt(text.replace(/[^0-9]/g, ''));
        if (!number) return;

        const suffix = text.replace(/[0-9]/g, '');
        let current = 0;
        const increment = Math.ceil(number / 60);
        const duration = 2000;
        const stepTime = Math.floor(duration / number);

        const timer = setInterval(() => {
            current += increment;
            if (current >= number) {
                current = number;
                clearInterval(timer);
            }
            counter.textContent = current + suffix;
        }, stepTime);
    });
}

// ============================================
// RUN COUNTER ANIMATION WHEN SCROLLED INTO VIEW
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const statsSection = document.querySelector('.stats');
    if (!statsSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters();
                observer.unobserve(statsSection);
            }
        });
    }, { threshold: 0.5 });

    observer.observe(statsSection);
});

// ============================================
// SMOOTH SCROLLING FOR NAV LINKS
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ============================================
// CONTACT FORM HANDLING
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.querySelector('.contact-form');
    if (!contactForm) return;

    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const name = this.querySelector('input[type="text"]').value;
        const email = this.querySelector('input[type="email"]').value;
        const message = this.querySelector('textarea').value;

        if (!name || !email || !message) {
            alert('Please fill in all fields');
            return;
        }

        alert('✅ Thank you for your message! We will get back to you soon.');
        this.reset();
    });
});