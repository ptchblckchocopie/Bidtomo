<script lang="ts">
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export let params: any = {};

  let title = 'Marketplace Platform';
  let description = 'Buy and bid on unique items from sellers worldwide';
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
</svelte:head>

<section>
  <h1>Welcome to {title}</h1>
  <p>{description}</p>

  <div class="cta">
    <a href="/products" class="button primary">Browse Products</a>
    <a href="/sell" class="button secondary">Start Selling</a>
  </div>

  <div class="features">
    <div class="feature">
      <h3>Browse Items</h3>
      <p>Discover unique products from verified sellers</p>
    </div>
    <div class="feature">
      <h3>Place Bids</h3>
      <p>Bid on items and win great deals</p>
    </div>
    <div class="feature">
      <h3>Sell Products</h3>
      <p>List your items and reach buyers worldwide</p>
    </div>
  </div>
</section>

<style>
  section {
    text-align: center;
  }

  h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .cta {
    margin: 2rem 0;
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .button {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    text-decoration: none;
    font-weight: bold;
    transition: opacity 0.2s;
  }

  .button:hover {
    opacity: 0.8;
  }

  .button.primary {
    background-color: #0066cc;
    color: white;
  }

  .button.secondary {
    background-color: #666;
    color: white;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-top: 3rem;
  }

  .feature {
    padding: 1.5rem;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  .feature h3 {
    margin-bottom: 0.5rem;
  }
</style>
