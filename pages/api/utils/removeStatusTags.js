export async function removeStatusTags(shopifyClient, orderIdGid, tags) {
  const mutation = `
    mutation removeTags($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        node {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  try {
    const response = await shopifyClient.request(mutation, { variables: { id: orderIdGid, tags } });
    if (response?.data?.tagsRemove?.userErrors?.length > 0) {
      console.error('GraphQL user errors removing tags:', response.data.tagsRemove.userErrors);
      return null;
    }
    console.log('Tags removed successfully:', response.data.tagsRemove.node);
    return response.data.tagsRemove.node;
  } catch (error) {
    const gqlErrors = error.response?.errors ? JSON.stringify(error.response.errors, null, 2) : '';
    console.error('Error removing status tags:', error.message, gqlErrors);
    return null;
  }
}