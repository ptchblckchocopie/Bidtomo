<script lang="ts">
  import { authStore } from '$lib/stores/auth';
</script>

<svelte:head>
  <title>BidMo.to - The Future of Filipino Online Auctions</title>
  <meta name="description" content="Bid mo 'to! Join our experimental bidding platform and help shape the future of online auctions in the Philippines" />
</svelte:head>

<div class="landing-page">
  <!-- Beta Notice Banner -->
  <div class="beta-banner">
    <div class="beta-content">
      <span class="beta-badge">🚧 EXPERIMENTAL</span>
      <p>
        We're testing what works and gathering public interest.
        <strong>No integrated payments yet</strong> - transactions are coordinated directly between buyers and sellers.
        Once we have enough traction, we'll integrate secure payments and become a full-blown bidding platform!
      </p>
    </div>
  </div>

  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-content">
      <div class="logo-container">
        <img src="/bidmo.to.png" alt="BidMo.to" class="hero-logo" />
      </div>
      <h1 class="hero-title">
        Welcome to <span class="brand">BidMo.to</span>
      </h1>
      <p class="hero-subtitle">
        Bid mo 'to! The Filipino way to bid, buy, and sell unique items
      </p>
      <p class="hero-description">
        Join us in building the Philippines' most exciting auction platform.
        Your participation helps us understand what features matter most!
      </p>

      <div class="cta-buttons">
        <a href="/products" class="btn btn-primary">
          <span class="btn-icon">🔍</span>
          Browse Auctions
        </a>
        {#if $authStore.isAuthenticated}
          <a href="/sell" class="btn btn-secondary">
            <span class="btn-icon">🔨</span>
            List an Item
          </a>
        {:else}
          <a href="/register" class="btn btn-secondary">
            <span class="btn-icon">✨</span>
            Join Beta
          </a>
        {/if}
      </div>

      <div class="hero-stats">
        <div class="stat">
          <div class="stat-number">FREE</div>
          <div class="stat-label">To Join</div>
        </div>
        <div class="stat">
          <div class="stat-number">SAFE</div>
          <div class="stat-label">No Payment Integration</div>
        </div>
        <div class="stat">
          <div class="stat-number">BETA</div>
          <div class="stat-label">Help Us Grow</div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="how-it-works">
    <h2>How It Works (For Now)</h2>
    <p class="section-subtitle">Simple, experimental, and evolving based on your feedback</p>

    <div class="steps">
      <div class="step">
        <div class="step-number">1</div>
        <h3>Create Account</h3>
        <p>Sign up for free and join our beta community</p>
      </div>
      <div class="step">
        <div class="step-number">2</div>
        <h3>Browse or List</h3>
        <p>Explore active auctions or list your own items</p>
      </div>
      <div class="step">
        <div class="step-number">3</div>
        <h3>Place Bids</h3>
        <p>Bid on items you want - no payment needed yet</p>
      </div>
      <div class="step">
        <div class="step-number">4</div>
        <h3>Connect Directly</h3>
        <p>Winners chat with sellers to arrange payment & delivery</p>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="features">
    <h2>What We're Building</h2>
    <p class="section-subtitle">Features available now in our experimental phase</p>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">🏆</div>
        <h3>Live Bidding</h3>
        <p>Real-time auction updates and competitive bidding</p>
        <span class="feature-status live">Live Now</span>
      </div>

      <div class="feature-card">
        <div class="feature-icon">💬</div>
        <h3>Direct Messaging</h3>
        <p>Chat with buyers/sellers after winning bids</p>
        <span class="feature-status live">Live Now</span>
      </div>

      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <h3>Price Analytics</h3>
        <p>Track bidding trends and price history</p>
        <span class="feature-status live">Live Now</span>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🔍</div>
        <h3>Smart Search</h3>
        <p>Find items by keywords, categories, and status</p>
        <span class="feature-status live">Live Now</span>
      </div>

      <div class="feature-card">
        <div class="feature-icon">💳</div>
        <h3>Payment Integration</h3>
        <p>Secure, integrated payment processing</p>
        <span class="feature-status coming">Coming Soon</span>
      </div>

      <div class="feature-card">
        <div class="feature-icon">🛡️</div>
        <h3>Buyer Protection</h3>
        <p>Escrow services and dispute resolution</p>
        <span class="feature-status coming">Coming Soon</span>
      </div>
    </div>
  </section>

  <!-- Why Join Section -->
  <section class="why-join">
    <div class="why-join-content">
      <h2>Why Join Our Beta?</h2>
      <div class="benefits">
        <div class="benefit">
          <div class="benefit-icon">🎯</div>
          <div class="benefit-content">
            <h3>Shape the Future</h3>
            <p>Your feedback directly influences what features we build next</p>
          </div>
        </div>
        <div class="benefit">
          <div class="benefit-icon">🆓</div>
          <div class="benefit-content">
            <h3>Free Forever for Beta Users</h3>
            <p>Early adopters get premium features when we launch officially</p>
          </div>
        </div>
        <div class="benefit">
          <div class="benefit-icon">🤝</div>
          <div class="benefit-content">
            <h3>Build Community</h3>
            <p>Connect with fellow Filipinos who love unique finds and good deals</p>
          </div>
        </div>
        <div class="benefit">
          <div class="benefit-icon">📈</div>
          <div class="benefit-content">
            <h3>Grow With Us</h3>
            <p>Be part of the journey from experimental platform to full-scale marketplace</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="final-cta">
    <h2>Ready to Bid?</h2>
    <p>Join us in this experiment and help build something amazing for the Filipino community</p>
    <div class="cta-buttons">
      {#if $authStore.isAuthenticated}
        <a href="/products" class="btn btn-primary btn-large">
          Start Browsing
        </a>
        <a href="/sell" class="btn btn-secondary btn-large">
          List Your First Item
        </a>
      {:else}
        <a href="/register" class="btn btn-primary btn-large">
          Join Beta Now - It's Free!
        </a>
        <a href="/products" class="btn btn-secondary btn-large">
          Browse Without Signing Up
        </a>
      {/if}
    </div>
  </section>
</div>

<style>
  .landing-page {
    max-width: 100%;
    margin: -2rem;
    padding: 0;
  }

  /* Beta Banner */
  .beta-banner {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    border-bottom: 3px solid #d97706;
    padding: 1rem 2rem;
    animation: slideDown 0.5s ease-out;
  }

  .beta-content {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
  }

  .beta-badge {
    display: inline-block;
    background: rgba(0, 0, 0, 0.2);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 1px;
    margin-bottom: 0.5rem;
  }

  .beta-content p {
    margin: 0;
    color: white;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .beta-content strong {
    font-weight: 700;
    text-decoration: underline;
  }

  /* Hero Section */
  .hero {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    padding: 4rem 2rem;
    text-align: center;
  }

  .hero-content {
    max-width: 900px;
    margin: 0 auto;
  }

  .logo-container {
    margin-bottom: 2rem;
    animation: fadeInDown 0.8s ease-out;
  }

  .hero-logo {
    height: 120px;
    width: auto;
    filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.3));
  }

  .hero-title {
    font-size: 3.5rem;
    font-weight: 800;
    margin-bottom: 1rem;
    animation: fadeInUp 0.8s ease-out 0.2s both;
  }

  .brand {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-subtitle {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    opacity: 0.95;
    animation: fadeInUp 0.8s ease-out 0.4s both;
  }

  .hero-description {
    font-size: 1.1rem;
    margin-bottom: 2.5rem;
    opacity: 0.9;
    max-width: 700px;
    margin-left: auto;
    margin-right: auto;
    animation: fadeInUp 0.8s ease-out 0.6s both;
  }

  .cta-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 3rem;
    animation: fadeInUp 0.8s ease-out 0.8s both;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    border-radius: 50px;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.1rem;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }

  .btn-icon {
    font-size: 1.3rem;
  }

  .btn:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  }

  .btn-primary {
    background: white;
    color: #dc2626;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 2px solid white;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .btn-large {
    padding: 1.25rem 2.5rem;
    font-size: 1.2rem;
  }

  .hero-stats {
    display: flex;
    gap: 3rem;
    justify-content: center;
    flex-wrap: wrap;
    animation: fadeInUp 0.8s ease-out 1s both;
  }

  .stat {
    text-align: center;
  }

  .stat-number {
    font-size: 2rem;
    font-weight: 800;
    margin-bottom: 0.25rem;
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.9;
  }

  /* How It Works */
  .how-it-works {
    padding: 5rem 2rem;
    background: linear-gradient(to bottom, white 0%, #f9fafb 100%);
  }

  .how-it-works h2,
  .features h2,
  .why-join h2,
  .final-cta h2 {
    text-align: center;
    font-size: 2.5rem;
    font-weight: 800;
    margin-bottom: 1rem;
    color: #1f2937;
  }

  .section-subtitle {
    text-align: center;
    font-size: 1.2rem;
    color: #6b7280;
    margin-bottom: 3rem;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .step {
    text-align: center;
    padding: 2rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
  }

  .step:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
  }

  .step-number {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0 auto 1.5rem;
  }

  .step h3 {
    font-size: 1.3rem;
    margin-bottom: 0.75rem;
    color: #1f2937;
  }

  .step p {
    color: #6b7280;
    line-height: 1.6;
  }

  /* Features */
  .features {
    padding: 5rem 2rem;
    background: white;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .feature-card {
    padding: 2.5rem;
    background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
    border-radius: 16px;
    border: 2px solid #e5e7eb;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
  }

  .feature-card:hover {
    transform: translateY(-5px);
    border-color: #dc2626;
    box-shadow: 0 10px 30px rgba(220, 38, 38, 0.15);
  }

  .feature-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .feature-card h3 {
    font-size: 1.3rem;
    margin-bottom: 0.75rem;
    color: #1f2937;
  }

  .feature-card p {
    color: #6b7280;
    line-height: 1.6;
    margin-bottom: 1rem;
  }

  .feature-status {
    display: inline-block;
    padding: 0.375rem 0.875rem;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .feature-status.live {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .feature-status.coming {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: white;
  }

  /* Why Join */
  .why-join {
    padding: 5rem 2rem;
    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
    color: white;
  }

  .why-join-content {
    max-width: 1000px;
    margin: 0 auto;
  }

  .benefits {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2.5rem;
    margin-top: 3rem;
  }

  .benefit {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .benefit-icon {
    font-size: 2.5rem;
    flex-shrink: 0;
  }

  .benefit-content h3 {
    font-size: 1.3rem;
    margin-bottom: 0.5rem;
  }

  .benefit-content p {
    color: #d1d5db;
    line-height: 1.6;
  }

  /* Final CTA */
  .final-cta {
    padding: 5rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-align: center;
  }

  .final-cta p {
    font-size: 1.2rem;
    margin-bottom: 2.5rem;
    opacity: 0.95;
  }

  /* Animations */
  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .hero-title {
      font-size: 2.5rem;
    }

    .hero-subtitle {
      font-size: 1.2rem;
    }

    .benefits {
      grid-template-columns: 1fr;
    }

    .btn {
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
    }
  }
</style>
