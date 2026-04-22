"""GraphQL query strings for GitHub PR archaeology."""

PR_ARCHAEOLOGY_QUERY = """
query PRArchaeology($owner: String!, $repo: String!, $pr: Int!) {
  rateLimit {
    remaining
    cost
    resetAt
  }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      number
      title
      body
      state
      mergedAt
      createdAt
      updatedAt
      url
      author { login }
      baseRefName
      headRefName
      additions
      deletions
      changedFiles
      labels(first: 20) { nodes { name } }
      reviewRequests(first: 10) {
        nodes {
          requestedReviewer {
            __typename
            ... on User { login }
          }
        }
      }
      reviews(first: 100) {
        nodes {
          id
          author { login }
          state
          body
          submittedAt
          url
        }
      }
      comments(first: 100) {
        nodes {
          id
          databaseId
          author { login }
          body
          createdAt
          url
        }
      }
      reviewThreads(first: 100) {
        nodes {
          id
          path
          line
          isResolved
          comments(first: 50) {
            nodes {
              id
              databaseId
              author { login }
              body
              diffHunk
              originalPosition
              createdAt
              url
              replyTo { id }
            }
          }
        }
      }
      closingIssuesReferences(first: 10) {
        nodes {
          number
          title
          body
          state
          url
          comments(first: 50) {
            nodes {
              id
              author { login }
              body
              createdAt
              url
            }
          }
        }
      }
      commits(first: 100) {
        nodes {
          commit {
            oid
            message
            author { name email }
            committedDate
          }
        }
      }
      timelineItems(first: 50, itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT, REVIEW_REQUESTED_EVENT, LABELED_EVENT, CROSS_REFERENCED_EVENT]) {
        nodes {
          __typename
          ... on HeadRefForcePushedEvent { actor { login } createdAt }
          ... on ReviewRequestedEvent { actor { login } createdAt }
          ... on LabeledEvent { actor { login } createdAt label { name } }
          ... on CrossReferencedEvent {
            actor { login }
            createdAt
            source {
              __typename
              ... on PullRequest { number url title }
              ... on Issue { number url title }
            }
          }
        }
      }
    }
  }
}
"""

PR_LIST_QUERY = """
query PRList($owner: String!, $repo: String!, $after: String) {
  rateLimit { remaining cost resetAt }
  repository(owner: $owner, name: $repo) {
    pullRequests(states: MERGED, first: 50, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        mergedAt
        author { login }
        additions
        deletions
        comments { totalCount }
        reviewThreads { totalCount }
      }
    }
  }
}
"""
