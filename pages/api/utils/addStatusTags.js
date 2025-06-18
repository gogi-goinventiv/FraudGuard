export async function addStatusTags(shopifyClient, orderIdGid, tags) {
  const mutation = `
    mutation addTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          id
        }
        userErrors {
          message
        }
      }
    }
  `;
  try {
    const response = await shopifyClient.request(mutation, { variables: { id: orderIdGid, tags } });
    if (response?.data?.tagsAdd?.userErrors?.length > 0) {
      console.error('GraphQL user errors adding tags:', response.data.tagsAdd.userErrors);
      return null;
    }
    console.log('Tags added successfully:', response.data.tagsAdd.node);
    return response.data.tagsAdd.node;
  } catch (error) {
    const gqlErrors = error.response?.errors ? JSON.stringify(error.response.errors, null, 2) : '';
    console.error('Error adding status tags:', error.message, gqlErrors);
    return null;
  }
}